var fs = require("fs");
var path = require("path");
var zlib = require("zlib");

var root = path.resolve(__dirname, "..");
var failures = [];

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function readPngSize(name) {
  var file = fs.readFileSync(path.join(root, name));
  var signature = file.subarray(0, 8).toString("hex");
  assert(signature === "89504e470d0a1a0a", name + " is a PNG");
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20)
  };
}

var html = read("index.html");
var css = read("styles.css");
var js = read("app.js");
var serviceWorker = read("service-worker.js");
var manifest = JSON.parse(read("manifest.webmanifest"));
var pkg = JSON.parse(read("package.json"));

assert(html.indexOf("width=600, height=600") !== -1, "viewport is fixed to 600x600");
assert(html.indexOf('rel="manifest" href="manifest.webmanifest"') !== -1, "manifest is linked");
assert(html.indexOf('rel="icon" href="favicon.png"') !== -1, "favicon is linked");
assert(html.indexOf('id="steps-value"') !== -1, "steps display is present");
assert(html.indexOf('id="duration-value"') !== -1, "duration display is present");
assert(html.indexOf('id="cadence-value"') !== -1, "cadence display is present");
assert(html.indexOf("M EVT") !== -1 && html.indexOf("O EVT") !== -1, "raw sensor event diagnostics are visible");
assert(html.indexOf('data-action="start"') !== -1, "sensor permission control is present");
assert(html.indexOf('class="focusable control') !== -1, "focusable controls are present");
assert(html.indexOf('target="_blank"') === -1 && html.indexOf('target="_top"') === -1, "app UI does not use external navigation targets");

assert(css.indexOf("width: 600px") !== -1 && css.indexOf("height: 600px") !== -1, "CSS fixes the 600px canvas");
assert(css.indexOf("overflow: hidden") !== -1, "scrolling is disabled");
assert(css.indexOf("--bg: #000000") !== -1, "black page canvas is defined");
assert(css.indexOf("--focus: #44d7ff") !== -1, "visible cyan focus ring is defined");
assert(css.indexOf("min-height: 56px") !== -1, "controls have stable large targets");
assert(css.indexOf("letter-spacing: 0") !== -1, "letter spacing is not negative");
assert(css.indexOf("font-size: 166px") !== -1, "steps are the primary HUD readout");
assert(css.indexOf(".control-panel[hidden]") !== -1, "controls can be hidden");

assert(js.indexOf("DeviceMotionEvent") !== -1, "device motion API is used");
assert(js.indexOf("DeviceOrientationEvent") !== -1, "device orientation API is used");
assert(js.indexOf("detectMotionStep") !== -1, "motion-based step detection is present");
assert(js.indexOf("detectOrientationStep") !== -1, "orientation-based fallback step detection is present");
assert(js.indexOf("motionEvents") !== -1 && js.indexOf("orientationEvents") !== -1, "sensor event counts are tracked");
assert(js.indexOf("renderSensorDiagnostics") !== -1, "raw sensor diagnostics are rendered");
assert(js.indexOf("activeStepSignal") !== -1, "sustained walking signal can increment steps");
assert(js.indexOf("angularDelta") !== -1, "orientation heading deltas are normalized");
assert(js.indexOf("navigator.geolocation.watchPosition") !== -1, "geolocation watch is used");
assert(js.indexOf("requestPermission") !== -1, "sensor permissions are user-gesture gated");
assert(js.indexOf("PERMISSION_TIMEOUT_MS") !== -1, "sensor permission requests are time-boxed");
assert(js.indexOf("permissionWithTimeout") !== -1, "hanging sensor permissions cannot block start");
assert(js.indexOf("DeviceOrientationEvent.requestPermission") < js.indexOf("DeviceMotionEvent.requestPermission"), "orientation permission is requested before motion permission");
assert(js.indexOf("event.preventDefault()") !== -1, "D-pad key handling prevents default browser behavior");
assert(js.indexOf("window.addEventListener(\"keydown\"") !== -1, "keydown is captured at window level");
assert(js.indexOf("activeControlOrDefault") !== -1, "Enter activates the default visible control when focus is missing");
assert(js.indexOf("Backspace") !== -1 && js.indexOf("BrowserBack") !== -1, "back controls reveal is implemented");
assert(js.indexOf("hideControls") !== -1, "controls can be hidden after reveal");
assert(js.indexOf("localStorage") !== -1, "lightweight localStorage cache is present");
assert(js.indexOf("serviceWorker") !== -1, "service worker registration is present");
assert(js.indexOf("window.open") === -1, "app does not use popup navigation");
assert(js.indexOf("window.top.location") === -1, "app does not attempt blocked top-level navigation");
assert(!/client_secret|refresh_token|password\s*=|AIza[0-9A-Za-z_-]{20,}/.test(js), "app JS contains no secrets or API keys");

assert(manifest.name === "Ray-Ban Walkpad HUD", "manifest name matches app");
assert(manifest.icons && manifest.icons[0] && manifest.icons[0].src === "favicon.png", "manifest references favicon.png");
assert(manifest.background_color === "#000000", "manifest background is black");
assert(manifest.display === "standalone", "manifest uses standalone display");

assert(serviceWorker.indexOf("rayban-walkpad-hud-v7") !== -1, "service worker cache name is current");
assert(serviceWorker.indexOf("self.skipWaiting()") !== -1, "service worker activates updated assets promptly");
assert(serviceWorker.indexOf("self.clients.claim()") !== -1, "service worker claims clients promptly");
["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./favicon.png"].forEach(function (asset) {
  assert(serviceWorker.indexOf(asset) !== -1, "service worker caches " + asset);
});

assert(pkg.scripts && pkg.scripts.check === "node scripts/check.js", "npm check script is present");
assert(pkg.scripts && pkg.scripts.start === "node server.js", "npm start script is present");

var size = readPngSize("favicon.png");
assert(size.width >= 53 && size.height >= 53, "favicon is larger than 52x52");

var gzipped = zlib.gzipSync(Buffer.from(js));
assert(gzipped.length < 500 * 1024, "JavaScript is under 500KB gzipped");

if (failures.length) {
  console.error("Check failed:");
  failures.forEach(function (failure) {
    console.error("- " + failure);
  });
  process.exit(1);
}

console.log("All checks passed.");
console.log("app.js gzip bytes: " + gzipped.length);
console.log("favicon: " + size.width + "x" + size.height + " PNG");
