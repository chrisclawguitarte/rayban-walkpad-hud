# Ray-Ban Walkpad HUD

A full-screen 600x600 Meta Ray-Ban Display web app for walking-pad sessions at a standing desk.

The app is static HTML/CSS/JavaScript for GitHub Pages. It uses:

- DeviceMotionEvent acceleration to estimate steps from head/body motion
- DeviceOrientationEvent to monitor orientation/tilt while walking
- navigator.geolocation.watchPosition for paired-phone GPS status
- D-pad keyboard handling for Meta Neural Band and Cap Touch input
- Browser Back, Escape, and Backspace as controls-reveal fallbacks
- A fixed 600x600 canvas with no scrolling

Step counts are sensor estimates from the browser IMU, not a medical-grade pedometer. Walking pads are stationary, so GPS is shown only as a sensor health signal and is not used for step totals.

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

On first launch, START is visible because browser sensor permissions require a user gesture. After the session starts, controls hide automatically. Press Browser Back, Escape, or Backspace to reveal them again, then use the D-pad and Enter.

## Device Setup

Meta Ray-Ban Display web apps need a public HTTPS URL. Add the deployed URL in the Meta AI app:

Display Glasses settings > App connections > Web apps

Public URL:

~~~text
https://chrisclawguitarte.github.io/rayban-walkpad-hud/
~~~

