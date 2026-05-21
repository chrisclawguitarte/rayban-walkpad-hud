(function () {
  "use strict";

  var SESSION_KEY = "raybanWalkpadHud.lastSession.v1";
  var SENSITIVITY_KEY = "raybanWalkpadHud.sensitivity.v1";
  var GPS_FEET_PER_METER = 3.280839895;
  var STEP_WINDOWS_MS = 20000;
  var PERMISSION_TIMEOUT_MS = 1500;

  var PROFILES = {
    high: {
      label: "HIGH",
      base: 0.14,
      min: 0.18,
      max: 1.15,
      noise: 1.2,
      minInterval: 250
    },
    normal: {
      label: "NORM",
      base: 0.22,
      min: 0.26,
      max: 1.45,
      noise: 1.45,
      minInterval: 280
    },
    low: {
      label: "LOW",
      base: 0.34,
      min: 0.40,
      max: 1.80,
      noise: 1.75,
      minInterval: 320
    }
  };

  var dom = {};
  var state = {
    running: false,
    startedOnce: false,
    sessionStartedAt: 0,
    elapsedBeforeStart: 0,
    steps: 0,
    recentSteps: [],
    lastStepAt: 0,
    gravityMagnitude: null,
    filteredSignal: 0,
    previousSignal: 0,
    noise: 0,
    sensitivity: readSensitivity(),
    listenersAttached: false,
    locationWatchId: null,
    lastMotionAt: 0,
    lastHandledKeyAt: 0,
    sensorPermissionState: "unknown",
    historyTrapArmed: false
  };

  function init() {
    dom.app = document.getElementById("app");
    dom.status = document.getElementById("session-status");
    dom.clock = document.getElementById("clock");
    dom.steps = document.getElementById("steps-value");
    dom.duration = document.getElementById("duration-value");
    dom.cadence = document.getElementById("cadence-value");
    dom.motion = document.getElementById("motion-value");
    dom.orientation = document.getElementById("orientation-value");
    dom.gps = document.getElementById("gps-value");
    dom.lastSession = document.getElementById("last-session");
    dom.sensitivity = document.getElementById("sensitivity-value");
    dom.signal = document.getElementById("signal-value");
    dom.controlPanel = document.getElementById("control-panel");
    dom.startButton = document.querySelector('[data-action="start"]');
    dom.pauseButton = document.querySelector('[data-action="pause"]');

    updateClock();
    renderLastSession();
    renderSensitivity();
    renderSession();
    bindControls();
    bindDpadNavigation();
    installBackReveal();
    focusPreferredControl();

    setInterval(updateClock, 1000);
    setInterval(renderSession, 250);
    setInterval(renderSensorFreshness, 1000);

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("./service-worker.js").catch(function () {});
      });
    }
  }

  function bindControls() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-action]"), function (button) {
      button.addEventListener("click", function () {
        handleAction(button.getAttribute("data-action"));
      });
    });
  }

  function bindDpadNavigation() {
    window.addEventListener("keydown", handleNavigationKey, true);
    window.addEventListener("keyup", function (event) {
      var key = event.key;
      var activationKey = key === "Enter" || key === " " || key === "Spacebar";
      if (!activationKey || Date.now() - state.lastHandledKeyAt < 180) {
        return;
      }
      handleNavigationKey(event);
    }, true);
  }

  function handleNavigationKey(event) {
    var key = event.key;

    if (key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
      state.lastHandledKeyAt = Date.now();
      showControls();
      moveFocus(key);
      return;
    }

    if (key === "Enter" || key === " " || key === "Spacebar") {
      var target = activeControlOrDefault();
      if (target) {
        event.preventDefault();
        state.lastHandledKeyAt = Date.now();
        activateControl(target);
      }
      return;
    }

    if (key === "Escape" || key === "Backspace" || key === "BrowserBack") {
      event.preventDefault();
      state.lastHandledKeyAt = Date.now();
      showControls();
    }
  }

  function installBackReveal() {
    if (!window.history || typeof window.history.pushState !== "function") {
      return;
    }

    try {
      window.history.replaceState({ walkpadHudRoot: true }, "");
      window.history.pushState({ walkpadHud: true }, "");
      state.historyTrapArmed = true;
    } catch (error) {
      state.historyTrapArmed = false;
    }

    window.addEventListener("popstate", function () {
      showControls();
      if (state.historyTrapArmed) {
        setTimeout(function () {
          try {
            window.history.pushState({ walkpadHud: true }, "");
          } catch (error) {
            state.historyTrapArmed = false;
          }
        }, 0);
      }
    });
  }

  function moveFocus(key) {
    var items = Array.prototype.filter.call(document.querySelectorAll(".focusable"), function (item) {
      return !item.disabled && item.offsetParent !== null;
    });

    if (!items.length) {
      return;
    }

    var current = document.activeElement && document.activeElement.classList.contains("focusable")
      ? document.activeElement
      : items[0];
    var currentCenter = centerOf(current.getBoundingClientRect());
    var best = null;
    var bestScore = Infinity;

    items.forEach(function (item) {
      if (item === current) {
        return;
      }

      var center = centerOf(item.getBoundingClientRect());
      var dx = center.x - currentCenter.x;
      var dy = center.y - currentCenter.y;
      var primary = 0;
      var secondary = 0;

      if (key === "ArrowRight" && dx > 0) {
        primary = dx;
        secondary = Math.abs(dy);
      } else if (key === "ArrowLeft" && dx < 0) {
        primary = Math.abs(dx);
        secondary = Math.abs(dy);
      } else if (key === "ArrowDown" && dy > 0) {
        primary = dy;
        secondary = Math.abs(dx);
      } else if (key === "ArrowUp" && dy < 0) {
        primary = Math.abs(dy);
        secondary = Math.abs(dx);
      } else {
        return;
      }

      var score = primary + secondary * 1.8;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    });

    if (!best) {
      var index = items.indexOf(current);
      if (key === "ArrowRight" || key === "ArrowDown") {
        best = items[(index + 1) % items.length];
      } else {
        best = items[(index - 1 + items.length) % items.length];
      }
    }

    best.focus();
    updateFocusClass(best);
  }

  function centerOf(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function updateFocusClass(active) {
    Array.prototype.forEach.call(document.querySelectorAll(".focusable"), function (item) {
      item.classList.toggle("is-focused", item === active);
    });
  }

  function focusPreferredControl() {
    var preferred = firstVisibleControl("[data-preferred-focus]") || firstVisibleControl(".focusable");
    if (preferred) {
      preferred.focus();
      updateFocusClass(preferred);
    }
  }

  function activeControlOrDefault() {
    var active = document.activeElement;
    if (active && active.classList.contains("focusable") && isVisible(active) && !active.disabled) {
      return active;
    }
    return firstVisibleControl("[data-preferred-focus]") || firstVisibleControl(".focusable");
  }

  function firstVisibleControl(selector) {
    var controls = Array.prototype.slice.call(document.querySelectorAll(selector));
    for (var index = 0; index < controls.length; index += 1) {
      if (isVisible(controls[index]) && !controls[index].disabled) {
        return controls[index];
      }
    }
    return null;
  }

  function isVisible(element) {
    return !!(element && element.offsetParent !== null);
  }

  function activateControl(control) {
    updateFocusClass(control);
    control.focus();
    handleAction(control.getAttribute("data-action"));
  }

  function handleAction(action) {
    if (action === "start") {
      startWalk();
    } else if (action === "pause") {
      pauseWalk();
    } else if (action === "reset") {
      resetWalk();
    } else if (action === "sensitivity") {
      cycleSensitivity();
    }
  }

  async function startWalk() {
    if (state.running) {
      hideControls();
      return;
    }

    state.startedOnce = true;
    setStatus("STARTING");
    showControls();
    await requestSensorPermissions();
    setStatus("SENSORS");
    attachSensorListeners();
    startGeolocationWatch();

    if (!state.running) {
      state.sessionStartedAt = Date.now() - state.elapsedBeforeStart;
      state.running = true;
    }

    setStatus("LIVE");
    renderButtons();
    hideControls();
  }

  function pauseWalk() {
    if (!state.running) {
      return;
    }

    state.elapsedBeforeStart = currentElapsedMs();
    state.running = false;
    saveLastSession();
    setStatus("PAUSED");
    renderSession();
    renderButtons();
    showControls();
  }

  function resetWalk() {
    if (state.steps > 0 || currentElapsedMs() > 0) {
      saveLastSession();
    }

    state.running = false;
    state.sessionStartedAt = 0;
    state.elapsedBeforeStart = 0;
    state.steps = 0;
    state.recentSteps = [];
    state.lastStepAt = 0;
    state.gravityMagnitude = null;
    state.filteredSignal = 0;
    state.previousSignal = 0;
    state.noise = 0;
    setStatus("READY");
    renderLastSession();
    renderSession();
    renderButtons();
    showControls();
  }

  function cycleSensitivity() {
    if (state.sensitivity === "normal") {
      state.sensitivity = "high";
    } else if (state.sensitivity === "high") {
      state.sensitivity = "low";
    } else {
      state.sensitivity = "normal";
    }

    localStorage.setItem(SENSITIVITY_KEY, state.sensitivity);
    renderSensitivity();
  }

  async function requestSensorPermissions() {
    var results = [];

    try {
      if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === "function") {
        dom.motion.textContent = "ORIENT";
        results.push(await permissionWithTimeout(window.DeviceOrientationEvent.requestPermission(), "orient"));
      }
      if (window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === "function") {
        dom.motion.textContent = "MOTION";
        results.push(await permissionWithTimeout(window.DeviceMotionEvent.requestPermission(), "motion"));
      }
    } catch (error) {
      state.sensorPermissionState = "limited";
      dom.motion.textContent = "LIMIT";
      return;
    }

    if (!results.length) {
      state.sensorPermissionState = "standard";
      return;
    }

    var hasTimeout = results.some(function (result) {
      return result.state === "timeout";
    });
    var hasDenied = results.some(function (result) {
      return result.state === "denied" || result.state === "error";
    });

    if (hasDenied) {
      state.sensorPermissionState = "limited";
      dom.motion.textContent = "LIMIT";
    } else if (hasTimeout) {
      state.sensorPermissionState = "timeout";
      dom.motion.textContent = "WAIT";
    } else {
      state.sensorPermissionState = "granted";
    }
  }

  function permissionWithTimeout(permissionPromise, label) {
    var settled = false;

    return new Promise(function (resolve) {
      var timer = setTimeout(function () {
        if (!settled) {
          settled = true;
          resolve({ label: label, state: "timeout" });
        }
      }, PERMISSION_TIMEOUT_MS);

      Promise.resolve(permissionPromise).then(function (value) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({ label: label, state: value || "granted" });
      }).catch(function () {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({ label: label, state: "error" });
      });
    });
  }

  function sensorStateLabel(activeLabel) {
    if (state.sensorPermissionState === "timeout") {
      return "WAIT";
    }
    if (state.sensorPermissionState === "limited") {
      return "LIMIT";
    }
    return activeLabel;
  }

  function attachSensorListeners() {
    if (state.listenersAttached) {
      return;
    }

    if ("DeviceMotionEvent" in window) {
      window.addEventListener("devicemotion", onMotion, true);
      dom.motion.textContent = sensorStateLabel("ON");
    } else {
      dom.motion.textContent = "NO IMU";
    }

    if ("DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", onOrientation, true);
      window.addEventListener("deviceorientationabsolute", onOrientation, true);
      dom.orientation.textContent = "ON";
    } else {
      dom.orientation.textContent = "NO IMU";
    }

    state.listenersAttached = true;
  }

  function startGeolocationWatch() {
    if (!("geolocation" in navigator)) {
      dom.gps.textContent = "NO GPS";
      return;
    }

    if (state.locationWatchId !== null) {
      navigator.geolocation.clearWatch(state.locationWatchId);
    }

    state.locationWatchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000
    });
  }

  function onMotion(event) {
    var vector = event.accelerationIncludingGravity || event.acceleration;
    if (!vector || typeof vector.x !== "number" || typeof vector.y !== "number" || typeof vector.z !== "number") {
      dom.motion.textContent = "NO VEC";
      return;
    }

    state.lastMotionAt = Date.now();
    dom.motion.textContent = state.running ? "LIVE" : "ON";

    if (!state.running) {
      return;
    }

    var magnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
    if (state.gravityMagnitude === null) {
      state.gravityMagnitude = magnitude;
    }

    state.gravityMagnitude = state.gravityMagnitude * 0.94 + magnitude * 0.06;
    var signal = magnitude - state.gravityMagnitude;
    state.filteredSignal = state.filteredSignal * 0.70 + signal * 0.30;
    state.noise = state.noise * 0.96 + Math.abs(state.filteredSignal) * 0.04;

    detectStep(Date.now(), state.filteredSignal);
    state.previousSignal = state.filteredSignal;
    renderSignal();
  }

  function detectStep(now, signal) {
    var profile = PROFILES[state.sensitivity] || PROFILES.normal;
    var threshold = clamp(profile.base + state.noise * profile.noise, profile.min, profile.max);
    var risingThroughThreshold = signal > threshold && state.previousSignal <= threshold * 0.72;
    var enoughTime = now - state.lastStepAt > profile.minInterval;

    if (!risingThroughThreshold || !enoughTime) {
      return;
    }

    state.steps += 1;
    state.lastStepAt = now;
    state.recentSteps.push(now);
    pruneRecentSteps(now);
    renderSession();
  }

  function onOrientation(event) {
    var beta = typeof event.beta === "number" ? event.beta : null;
    var gamma = typeof event.gamma === "number" ? event.gamma : null;
    var alpha = typeof event.alpha === "number" ? event.alpha : null;

    if (beta === null && gamma === null && alpha === null) {
      dom.orientation.textContent = "ON";
      return;
    }

    var tilt = Math.max(Math.abs(beta || 0), Math.abs(gamma || 0));
    if (tilt < 12) {
      dom.orientation.textContent = "LEVEL";
    } else if (tilt < 35) {
      dom.orientation.textContent = Math.round(tilt) + " DEG";
    } else {
      dom.orientation.textContent = "TILT";
    }
  }

  function onPosition(position) {
    var coords = position.coords;
    if (coords && typeof coords.accuracy === "number") {
      dom.gps.textContent = "+/-" + Math.round(coords.accuracy * GPS_FEET_PER_METER) + "FT";
    } else {
      dom.gps.textContent = "FIX";
    }
  }

  function onPositionError(error) {
    if (error && error.code === error.PERMISSION_DENIED) {
      dom.gps.textContent = "DENIED";
    } else {
      dom.gps.textContent = "WAIT";
    }
  }

  function showControls() {
    dom.controlPanel.hidden = false;
    dom.app.classList.add("controls-visible");
    renderButtons();
    focusPreferredControl();
  }

  function hideControls() {
    if (!state.startedOnce) {
      return;
    }
    dom.controlPanel.hidden = true;
    dom.app.classList.remove("controls-visible");
    if (document.activeElement && document.activeElement.classList.contains("focusable")) {
      document.activeElement.blur();
    }
  }

  function renderButtons() {
    dom.startButton.textContent = state.running ? "HIDE" : currentElapsedMs() > 0 ? "RESUME" : "START";
    dom.startButton.disabled = false;
    dom.pauseButton.disabled = !state.running;
  }

  function renderSession() {
    var elapsed = currentElapsedMs();
    dom.steps.textContent = formatSteps(state.steps);
    dom.duration.textContent = formatDuration(elapsed);
    dom.cadence.textContent = formatCadence();
    renderButtons();
  }

  function renderSensorFreshness() {
    if (!state.listenersAttached || state.lastMotionAt === 0) {
      return;
    }

    if (Date.now() - state.lastMotionAt > 3000) {
      dom.motion.textContent = "STALE";
    }
  }

  function renderSignal() {
    var absSignal = Math.abs(state.filteredSignal);
    if (absSignal < 0.2) {
      dom.signal.textContent = "LOW";
    } else if (absSignal < 0.8) {
      dom.signal.textContent = "MID";
    } else {
      dom.signal.textContent = "HIGH";
    }
  }

  function renderSensitivity() {
    dom.sensitivity.textContent = (PROFILES[state.sensitivity] || PROFILES.normal).label;
  }

  function renderLastSession() {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      dom.lastSession.textContent = "--";
      return;
    }

    try {
      var session = JSON.parse(raw);
      dom.lastSession.textContent = formatSteps(session.steps || 0) + " / " + formatDuration(session.durationMs || 0);
    } catch (error) {
      dom.lastSession.textContent = "--";
    }
  }

  function saveLastSession() {
    var durationMs = currentElapsedMs();
    if (durationMs < 1000 && state.steps === 0) {
      return;
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify({
      steps: state.steps,
      durationMs: durationMs,
      endedAt: new Date().toISOString()
    }));
    renderLastSession();
  }

  function formatCadence() {
    var now = Date.now();
    pruneRecentSteps(now);
    if (state.recentSteps.length < 2) {
      return "-- SPM";
    }

    var first = state.recentSteps[0];
    var last = state.recentSteps[state.recentSteps.length - 1];
    var minutes = (last - first) / 60000;
    if (minutes <= 0) {
      return "-- SPM";
    }

    return Math.round((state.recentSteps.length - 1) / minutes) + " SPM";
  }

  function pruneRecentSteps(now) {
    state.recentSteps = state.recentSteps.filter(function (time) {
      return now - time <= STEP_WINDOWS_MS;
    });
  }

  function currentElapsedMs() {
    if (!state.running) {
      return state.elapsedBeforeStart;
    }
    return Math.max(0, Date.now() - state.sessionStartedAt);
  }

  function formatDuration(ms) {
    var totalSeconds = Math.floor(ms / 1000);
    var seconds = totalSeconds % 60;
    var minutes = Math.floor(totalSeconds / 60) % 60;
    var hours = Math.floor(totalSeconds / 3600);

    if (hours > 0) {
      return hours + ":" + pad(minutes) + ":" + pad(seconds);
    }
    return pad(minutes) + ":" + pad(seconds);
  }

  function formatSteps(value) {
    return String(Math.max(0, Math.floor(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function pad(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function setStatus(value) {
    dom.status.textContent = value;
  }

  function updateClock() {
    var now = new Date();
    dom.clock.textContent = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function readSensitivity() {
    var value = localStorage.getItem(SENSITIVITY_KEY);
    return PROFILES[value] ? value : "normal";
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
