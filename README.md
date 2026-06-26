# Call DATA Dashboard

A high-fidelity, real-time call log dashboard built using HTML, CSS (Vanilla), and JavaScript. The application displays a persistent 4-day log schedule utilizing local browser storage, and automatically updates in real-time as the system clock advances.

## Features
- **Real-Time Log Updates**: Future calls are automatically revealed as the actual local clock reaches their scheduled timestamps.
- **Persistent Schedule**: Data is generated once on first visit and saved in `localStorage` to ensure a consistent, realistic experience across reloads.
- **Indian Phone Format**: Displays numbers in the standard Indian layout (`+91 XXXXX-X1234`).
- **Privacy Masking**: Easily toggle between **CSS Blur** and **X-Mark** privacy modes.
- **Analytics Visualization**: Interactive Chart.js graphs displaying daily call counts.
- **Responsive Layout**: Designed for mobile and desktop screens using a premium glassmorphic dark theme.

## Deployment
This is a purely static website. It can be deployed directly to Vercel, Netlify, or GitHub Pages.
