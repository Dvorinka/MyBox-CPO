# Additional Dashboard Improvements

---

# Refresh Button Bug

## Issue
The refresh button currently appears to do nothing or does not reliably reload data.

### Required fixes
- Ensure refresh invalidates all relevant queries.
- Force station data refetch.
- Refetch:
  - station list
  - telemetry
  - power history
  - active sessions
  - uptime metrics
  - map markers/statuses

### UX Improvements
- Add loading spinner while refreshing.
- Disable button during active refresh.
- Add success/error toast notifications.
- Add last refreshed timestamp.
- Animate refresh icon while loading.

### Technical Notes
If using TanStack Query:
- use `queryClient.invalidateQueries()`
- avoid stale cache reuse
- ensure refetchOnWindowFocus behavior is configured correctly

Potential current issue:
- button only updates local state
- cached queries remain untouched

---

# Station 5 Random Mode Charging Type Bug

## Issue
Station 5 random mode currently only uses:
- DC charging

It should randomly alternate between:
- AC charging
- DC charging

### Required behavior
Random mode should:
- randomly choose connector type
- simulate realistic usage distribution
- support mixed charging sessions

Example:
- 70% AC
- 30% DC

or configurable ratios.

### Improvements
Add:
- connector type badge
- AC/DC icons
- charging speed indicators
- separate telemetry metrics per charging type

### Recommended telemetry
Track separately:
- AC session count
- DC session count
- average AC session duration
- average DC session duration
- AC vs DC power delivery

---

# Session Duration Visualization

## Replace current Session Duration UI

Use:
- Area Chart - Step

This visualization is much better for:
- charging session progression
- live power ramps
- usage timelines
- duration visualization

---

# Area Chart - Step Integration

Use:

```tsx
"use client"

import { Activity, TrendingUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
```

---

# Recommended Session Duration Data

Example structure:

```ts
const chartData = [
  { time: "00:00", power: 0 },
  { time: "00:05", power: 12 },
  { time: "00:10", power: 28 },
  { time: "00:15", power: 47 },
  { time: "00:20", power: 51 },
  { time: "00:25", power: 49 },
  { time: "00:30", power: 32 },
]
```

---

# Better Use Cases for This Chart

This chart works extremely well for:
- charging power ramp visualization
- live charging curves
- connector performance
- session stability
- power fluctuations
- load balancing visualization

Much better than plain progress bars.

---

# Recommended Improvements

## Add live session indicators
Examples:
- current charging rate
- estimated completion
- session peak power
- connector temperature
- charging efficiency

---

# Suggested Enhancements

## Make chart realtime
Update:
- every 2–5 seconds
- smooth transitions
- animated area updates

---

# Recommended Chart Variants

## Per station
Show:
- live session chart

## Dashboard global
Show:
- aggregate charging load

## Historical analytics
Show:
- average session duration trends

---

# UX Improvements

Add:
- hover telemetry tooltips
- session event markers
- charging start/end markers
- AC/DC color differentiation
- charging anomaly indicators

---

# Performance Notes

Realtime charts + maps + telemetry together can become expensive fast.

You should:
- throttle updates
- memoize chart components
- batch websocket events
- avoid rerendering whole dashboard

Especially important once:
- multiple stations
- live telemetry
- historical analytics
- maps
- popups
- notifications

all run simultaneously.

---

# Suggested Architecture Direction

At this point the app is evolving into:
- a realtime telemetry dashboard

Polling-only architecture will start breaking down.

Strongly recommended:
- websocket event streaming
- centralized telemetry store
- event-driven UI updates
- query caching strategy

Otherwise:
- refresh bugs
- stale charts
- inconsistent station states
- race conditions

will keep multiplying.

BUT DON'T overdo it only do something if easy to implement and not time impossible.