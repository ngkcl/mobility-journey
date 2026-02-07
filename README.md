# Mobility Journey 🏋️

A personal dashboard for tracking posture, scoliosis correction, and mobility improvement.

## Features

- 📸 **Photo Timeline** - Upload and compare progress photos (front/back/side views)
- 📊 **Metrics Tracker** - Log Cobb angle, pain levels, flexibility, and more
- 📝 **Analysis Log** - AI insights, personal notes, and specialist feedback
- ✅ **Protocol Tracker** - Daily exercises, appointments, supplements
- 📈 **Progress Charts** - Visualize improvement over time

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Recharts for visualizations
- Lucide React for icons

## Getting Started

```bash
# Install dependencies
bun install

# Run development server
bun dev

# Build for production
bun run build
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Testing

```bash
# Run unit tests (Vitest)
pnpm test

# Lint the codebase
pnpm lint

# Typecheck without emitting files
pnpm typecheck

# Run all checks in sequence
pnpm check
```

## Project Structure

```
src/
├── app/
│   ├── page.tsx        # Main dashboard page
│   ├── layout.tsx      # Root layout
│   └── globals.css     # Global styles
└── components/
    ├── PhotoTimeline.tsx   # Photo upload and comparison
    ├── MetricsTracker.tsx  # Measurement logging
    ├── AnalysisLog.tsx     # Notes and insights
    ├── TodoTracker.tsx     # Exercise protocol
    └── ProgressCharts.tsx  # Data visualization
```

## Data Storage

Currently uses client-side state (demo mode). For production:
- Add Supabase/Firebase for persistent storage
- Implement user authentication
- Add image upload to cloud storage (S3/Cloudinary)

## Related

- Project plan: `~/clawd/projects/nick-posture-scoliosis/PROJECT.md`
- Progress log: `~/clawd/projects/nick-posture-scoliosis/PROGRESS.md`

---

Built with 💪 for the journey to better posture.
