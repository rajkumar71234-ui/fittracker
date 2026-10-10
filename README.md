# Minimal Health Tracker

A weight-loss tracker (you choose the number of days) that runs like an iPhone app from a GitHub Pages link. All your data is saved to a **private GitHub repo** — nothing is kept on the phone.

## What it does
- **Create account / log in** (username + password)
- **Profile:** height, weight, age, health issues → **BMI** (Asian-Indian cut-offs) and **body fat %**
- **Goal:** how many kg in how many days → daily calorie deficit needed
- **Daily log:** breakfast, lunch, dinner, protein, fruits, snacks, water, workouts, sleep, weight, steps, remark
- **Food photo:** snap your plate → AI names each food and estimates grams + calories → you confirm or edit → save
- **Food list:** ~100 common South Indian / Indian foods if you don't want to use a photo
- **Workouts:** pick the machine (treadmill, bike, elliptical, rower…) + minutes/speed → calories suggested → edit if your machine shows different
- **Dashboard:** eaten vs burned, deficit, grams of fat burned today, estimated body fat, and **your projected weight on your final day** if you keep the same pace

## Setup

**Owner, once:** open the link → the *One-time setup* screen asks for a GitHub token (fine-grained, access to `fittracker` + `fittracker-data`, Contents: Read and write) and an optional Claude API key for food photos.

**Everyone after that:** open the link → *Create account* with just a **username + password** → on iPhone Safari tap **Share → Add to Home Screen**.

## Where the data lives
- `fittracker-data/users/<username>.json` — login record (password stored only as a salted hash)
- `fittracker-data/data/<username>.json` — the daily log. Every save is a GitHub commit.
- `fittracker/config.json` — the shared app settings (token and API key, encrypted).

## How the numbers are calculated
- BMR: Mifflin-St Jeor. Daily burn = BMR × 1.2 + workouts (minus the resting part) + steps above 3,000.
- Body fat: US Navy tape method if you enter waist/neck(/hip), otherwise BMI + age formula. Then updated using your calorie deficit (7,700 kcal ≈ 1 kg fat).
- Treadmill / walking: ACSM equations (speed + incline). Bike: ACSM cycling equation. Other machines: MET tables.
- Final-day forecast: your average deficit over the last 7 logged days, continued to your final day; plus a trend line from your weigh-ins.

These are estimates, not medical advice. If you have a health condition, check your plan with your doctor.
