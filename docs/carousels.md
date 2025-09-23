# Carousel System Documentation

This document describes the carousel content management and scheduling system for the VitrineAlu marketing automation platform.

## Overview

The carousel system enables automated creation and scheduling of multi-image posts across social media platforms. It integrates with the WeeklyPlanner for intelligent content scheduling and supports platform-specific constraints and optimization.

## Architecture

### Core Components

1. **WeeklyPlanner** (`services/scheduler/src/weeklyPlanner.ts`)
   - Manages content scheduling logic
   - Validates platform constraints
   - Handles duplicate prevention
   - Integrates with carousel selection algorithms

2. **Carousel Builder** (planned)
   - Generates carousel content from media assets
   - Applies brand watermarks and formatting
   - Optimizes images for different platforms

3. **API Endpoints** (`apps/api/src/routes/carousels.ts`)
   - Preview carousel content for approval
   - Handle approval/rejection workflow
   - Integrate with Buffer API for publishing

## Configuration

### Schedule Configuration (`config/schedule.yml`)

The carousel system uses YAML-based configuration for scheduling rules and platform constraints.

#### Weekly Schedule Structure

```yaml
weekly_schedule:
  monday:
    - time: "09:00"
      content_type: "carousel"
      platforms: ["instagram", "facebook"]
      priority: "high"
```

#### Platform Rules

Each platform has specific carousel support and limits:

```yaml
platform_rules:
  instagram:
    carousel_support: true
    max_carousel_images: 10
    min_carousel_images: 2
    optimal_carousel_frequency: "2-3 per week"
    carousel_types: ["product_showcase", "behind_scenes", "tips_series", "portfolio"]

  facebook:
    carousel_support: true
    max_carousel_images: 10
    min_carousel_images: 2
    optimal_carousel_frequency: "1-2 per week"
    carousel_types: ["product_showcase", "customer_stories", "tips_series"]

  linkedin:
    carousel_support: false
    max_carousel_images: 0
    min_carousel_images: 0
    optimal_carousel_frequency: "none"
    carousel_types: []

  tiktok:
    carousel_support: false
    max_carousel_images: 0
    min_carousel_images: 0
    optimal_carousel_frequency: "none"
    carousel_types: []

  youtube_shorts:
    carousel_support: false
    max_carousel_images: 0
    min_carousel_images: 0
    optimal_carousel_frequency: "none"
    carousel_types: []
```

#### Content Types

```yaml
content_types:
  carousel:
    description: "Multi-image carousel post"
    requires_multiple_assets: true
    min_assets: 2
    max_assets: 10
    platforms: ["instagram", "facebook"]

  single:
    description: "Single image/video post"
    requires_multiple_assets: false
    min_assets: 1
    max_assets: 1
    platforms: ["instagram", "facebook", "linkedin", "tiktok", "youtube_shorts"]
```

#### Duplicate Prevention

```yaml
duplicate_prevention:
  monthly_carousel_rotation: true
  track_carousel_themes: true
  min_days_between_similar: 30
  max_carousel_reuse_per_quarter: 1
```

#### Scheduling Constraints

```yaml
constraints:
  max_posts_per_day_per_platform: 2
  max_carousels_per_week_per_platform: 3
  respect_quiet_hours: true
  buffer_between_posts: 30
```

### Brand Configuration (`config/brand.yaml`)

Brand-specific settings that affect carousel generation:

```yaml
brand: vitrinealu
tagline: "Bring light into living"
colors:
  primary: "#111827"
  secondary: "#FBBF24"
  accent: "#0EA5E9"
fonts:
  primary: "Montserrat"
  secondary: "Lato"
watermark:
  path: "assets/brand/watermark.png"
  opacity: 0.85
  margin_px: 48
aspect_ratios:
  reels: "9:16"
  square: "1:1"
  landscape: "16:9"
safe_areas:
  reels: { top: 220, bottom: 220, left: 40, right: 40 }
tone:
  - inspiring
  - authentic
  - premium
  - elegant
quiet_hours:
  days: ["saturday", "sunday"]
  start: "22:00"
  end: "08:00"
```

## WeeklyPlanner Selection Logic

### Slot Availability Checking

The WeeklyPlanner validates slot availability based on multiple criteria:

1. **Time Validation**: Slots in the past are marked unavailable
2. **Quiet Hours**: Respects brand-defined quiet hours from `brand.yaml`
3. **Platform Support**: Only schedules carousels on platforms that support them
4. **Weekly Limits**: Enforces maximum carousels per week per platform
5. **Daily Limits**: Respects maximum posts per day per platform

### Carousel Selection Algorithm

When selecting carousels for available slots:

1. **Fetch Available Carousels**: Query carousel service for approved content
2. **Apply Duplicate Prevention**:
   - Filter out carousels used within `min_days_between_similar`
   - Respect monthly rotation rules
   - Check quarterly reuse limits
3. **Platform Compatibility**: Ensure carousel works on target platforms
4. **Priority-Based Selection**: Higher priority slots get first choice

### Scheduling Process

1. Generate weekly plan based on schedule configuration
2. For each available slot:
   - If carousel slot: select appropriate carousel
   - If single slot: select single post content
   - Create posts for each target platform
   - Track usage for duplicate prevention

## Platform-Specific Limits

### Instagram

- **Max Images**: 10
- **Min Images**: 2
- **Optimal Frequency**: 2-3 per week
- **Supported Types**: Product showcase, behind-the-scenes, tips series, portfolio

### Facebook

- **Max Images**: 10
- **Min Images**: 2
- **Optimal Frequency**: 1-2 per week
- **Supported Types**: Product showcase, customer stories, tips series

### LinkedIn

- **Carousel Support**: No
- **Reason**: Platform focuses on professional content, carousels not optimized

### TikTok

- **Carousel Support**: No
- **Reason**: Short-form video platform, carousels don't fit format

### YouTube Shorts

- **Carousel Support**: No
- **Reason**: Vertical video format, carousels not supported

## API Integration

### Preview Endpoint

```bash
GET /api/carousels/preview
Authorization: Bearer <editor-token>
```

Returns carousels pending approval with full metadata.

### Approval Endpoint

```bash
POST /api/carousels/approve
Authorization: Bearer <editor-token>
Content-Type: application/json

{
  "carouselId": "carousel-123",
  "action": "approve|reject",
  "comments": "Optional feedback"
}
```

Triggers scheduling workflow on approval.

## Testing and Validation

### Unit Tests

- WeeklyPlanner slot availability logic
- Platform constraint validation
- Duplicate prevention algorithms
- Configuration parsing

### Integration Tests

- API endpoint functionality
- Carousel approval workflow
- Buffer API payload generation

### QA Checklist

See `qa/checklists/carousels.md` for comprehensive testing procedures.

## Monitoring and Metrics

### Key Metrics

- Carousel approval rate
- Platform engagement by carousel type
- Scheduling success rate
- Duplicate prevention effectiveness

### Logging

- Carousel selection decisions
- Scheduling conflicts and resolutions
- API integration events
- Performance metrics

## Troubleshooting

### Common Issues

1. **No Carousels Available**
   - Check carousel service for approved content
   - Verify platform compatibility
   - Review duplicate prevention settings

2. **Slot Unavailable**
   - Check quiet hours configuration
   - Verify platform limits not exceeded
   - Confirm schedule configuration validity

3. **API Authentication Errors**
   - Validate JWT token generation
   - Check editor role assignment
   - Verify secret key configuration

### Debug Commands

```bash
# Validate schedule configuration
npm run scheduler:validate-config

# Test carousel selection
npm run scheduler:test-selection

# Check API endpoints
npm run api:test-carousels
```

## Future Enhancements

- **AI-Powered Selection**: ML-based carousel content optimization
- **A/B Testing**: Carousel performance comparison
- **Dynamic Scheduling**: Real-time adjustment based on engagement
- **Multi-language Support**: Localized carousel content
- **Advanced Analytics**: Detailed performance tracking
