# Mobile layer (React Native) — reference design

The runnable demo covers mobile through Playwright device emulation (`mobile-android` project,
Pixel 7 viewport and touch). For a native React Native app the same journeys move to:

| Layer | Tool | Runs where |
| --- | --- | --- |
| Component | Jest + React Native Testing Library | every PR, seconds |
| E2E (grey-box) | Detox on iOS simulator / Android emulator | every PR for P1 journeys |
| Real devices | Appium on BrowserStack (device matrix by traffic share) | pre-release, nightly |

`detox-booking.e2e.js` below shows the booking journey written for Detox, reusing the same
`testID`s as the web `data-testid`s so one requirement maps to one test name on both channels.
It is a reference sample and is not executed by this repo's pipeline.
