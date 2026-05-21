# Ray-Ban Walkpad HUD

A full-screen 600x600 Meta Ray-Ban Display web app for walking-pad sessions at a standing desk.

The app is static HTML/CSS/JavaScript for GitHub Pages. It uses:

- DeviceMotionEvent acceleration to count steps from head/body motion when IMU events are available
- DeviceOrientationEvent to monitor orientation/tilt while walking when orientation events are available
- Generic Sensor APIs (`LinearAccelerationSensor`, then `Accelerometer`) as an additional real-sensor step source when the WebView exposes them
- D-pad keyboard handling for Meta Neural Band and Cap Touch input
- Browser Back, Escape, and Backspace as controls and diagnostics reveal fallbacks
- A fixed 600x600 canvas with no scrolling

Step counts only increment from real sensor events. There is no cadence or elapsed-time estimate. If `M EVT`, `O EVT`, and `G EVT` all stay at zero, the glasses WebView is not exposing a usable motion sensor stream to this web app.

## Run Locally

~~~bash
npm start
~~~

Open http://localhost:3000 and use arrow keys plus Enter to simulate the glasses D-pad. Sensor permissions require a user gesture, so focus START and press Enter.

## Validate

~~~bash
npm run check
~~~

## Controls

On first launch, START is visible because browser sensor permissions require a user gesture. After the session starts, controls and sensor diagnostics hide automatically. Press Browser Back, Escape, or Backspace to reveal them again, then use the D-pad and Enter.

## Device Setup

Meta Ray-Ban Display web apps need a public HTTPS URL. Add the deployed URL in the Meta AI app:

Display Glasses settings > App connections > Web apps

Public URL:

~~~text
https://chrisclawguitarte.github.io/rayban-walkpad-hud/
~~~
