# Carousel System QA Checklist

This checklist covers comprehensive testing of the carousel content management and scheduling system.

## Prerequisites

- [ ] All services are running (API, Scheduler, N8N Orchestrator)
- [ ] Database is populated with test data
- [ ] Sample media fixtures are available (`fixtures/media/projects/`)
- [ ] Brand configuration is valid (`config/brand.yaml`)
- [ ] Schedule configuration is valid (`config/schedule.yaml`)
- [ ] Test user with editor role exists

## Unit Tests

### WeeklyPlanner Tests

- [ ] **Slot Availability Validation**
  - [ ] Past slots are marked unavailable
  - [ ] Quiet hours are respected
  - [ ] Platform carousel support is validated
  - [ ] Weekly carousel limits are enforced
  - [ ] Daily post limits are enforced

- [ ] **Configuration Parsing**
  - [ ] Schedule YAML loads correctly
  - [ ] Platform rules are applied
  - [ ] Content type constraints work
  - [ ] Duplicate prevention settings load

- [ ] **Carousel Selection Logic**
  - [ ] Available carousels are filtered correctly
  - [ ] Duplicate prevention works (min days between similar)
  - [ ] Platform compatibility is checked
  - [ ] Monthly rotation rules are applied

### API Endpoint Tests

- [ ] **Authentication**
  - [ ] Valid JWT tokens are accepted
  - [ ] Invalid tokens are rejected (401)
  - [ ] Non-editor roles are rejected (403)
  - [ ] Missing authorization headers fail

- [ ] **Preview Endpoint**
  - [ ] Returns pending carousels only
  - [ ] Response includes all required fields
  - [ ] Media items have correct structure
  - [ ] Status filtering works correctly

- [ ] **Approval Endpoint**
  - [ ] Valid approval requests succeed
  - [ ] Invalid carousel IDs return 404
  - [ ] Non-pending carousels return 400
  - [ ] Status updates correctly on approval/rejection

## Integration Tests

### Preview Simulation

- [ ] **Carousel Generation**
  - [ ] Sample images load from fixtures
  - [ ] EXIF metadata is preserved
  - [ ] Different aspect ratios are handled
  - [ ] Brand watermarks are applied

- [ ] **Preview Display**
  - [ ] Carousel renders in admin UI
  - [ ] Image navigation works
  - [ ] Captions display correctly
  - [ ] Metadata shows properly

- [ ] **Platform Preview**
  - [ ] Instagram preview shows correctly
  - [ ] Facebook preview shows correctly
  - [ ] Unsupported platforms are filtered out

### Approval Workflow

- [ ] **Approval Process**
  - [ ] Editor can approve carousels
  - [ ] Status changes to 'approved'
  - [ ] Comments are saved
  - [ ] Audit trail is created

- [ ] **Rejection Process**
  - [ ] Editor can reject carousels
  - [ ] Status changes to 'draft'
  - [ ] Rejection reason is recorded
  - [ ] Carousel can be resubmitted

- [ ] **Workflow Integration**
  - [ ] Approved carousels trigger scheduling
  - [ ] WeeklyPlanner receives approval events
  - [ ] Posts are created in database

## Buffer API Integration

### Payload Generation

- [ ] **Instagram Carousels**
  - [ ] Correct media URLs are included
  - [ ] Captions are formatted properly
  - [ ] Hashtags are appended
  - [ ] Max 10 images limit is respected

- [ ] **Facebook Carousels**
  - [ ] Media array is structured correctly
  - [ ] Post text includes caption
  - [ ] Link attachments work
  - [ ] Scheduling timestamp is set

- [ ] **Multi-Platform Posting**
  - [ ] Same carousel posts to multiple platforms
  - [ ] Platform-specific formatting applied
  - [ ] Individual post IDs are tracked

### API Communication

- [ ] **Authentication**
  - [ ] Buffer API key is configured
  - [ ] OAuth flow works correctly
  - [ ] Token refresh handles expiration

- [ ] **Error Handling**
  - [ ] Network failures are retried
  - [ ] API rate limits are respected
  - [ ] Invalid payloads return meaningful errors

- [ ] **Webhook Integration**
  - [ ] Post status updates are received
  - [ ] Success/failure notifications work
  - [ ] Engagement metrics are tracked

## End-to-End Testing

### Complete Carousel Workflow

- [ ] **Content Creation**
  - [ ] Media upload succeeds
  - [ ] Carousel generation completes
  - [ ] Preview becomes available

- [ ] **Approval Process**
  - [ ] Admin reviews carousel
  - [ ] Approval/rejection works
  - [ ] Status updates propagate

- [ ] **Scheduling**
  - [ ] WeeklyPlanner selects appropriate slot
  - [ ] Platform constraints are respected
  - [ ] Duplicate prevention works

- [ ] **Publishing**
  - [ ] Buffer API receives correct payload
  - [ ] Posts are scheduled successfully
  - [ ] Confirmation webhooks are processed

### Platform-Specific Validation

- [ ] **Instagram**
  - [ ] Carousel posts successfully
  - [ ] All images appear in correct order
  - [ ] Captions and hashtags are included
  - [ ] Engagement tracking works

- [ ] **Facebook**
  - [ ] Carousel displays correctly
  - [ ] Link previews work
  - [ ] Multi-image navigation functions
  - [ ] Post analytics are captured

## Performance Testing

### Load Testing

- [ ] **Concurrent Approvals**
  - [ ] Multiple editors can approve simultaneously
  - [ ] Race conditions are handled
  - [ ] Database locks work correctly

- [ ] **Bulk Operations**
  - [ ] Large carousel sets process efficiently
  - [ ] Memory usage stays within limits
  - [ ] API response times are acceptable

### Scalability

- [ ] **Media Processing**
  - [ ] Large images are resized efficiently
  - [ ] Multiple aspect ratios are handled
  - [ ] Batch processing works

- [ ] **Scheduling**
  - [ ] Weekly plans generate quickly
  - [ ] Complex constraint checking performs well
  - [ ] Database queries are optimized

## Error Scenarios

### System Failures

- [ ] **Service Outages**
  - [ ] API unavailable during approval
  - [ ] Scheduler service down
  - [ ] Database connection lost

- [ ] **Data Corruption**
  - [ ] Invalid carousel data handling
  - [ ] Malformed configuration recovery
  - [ ] Database inconsistency resolution

### User Errors

- [ ] **Invalid Input**
  - [ ] Malformed approval requests
  - [ ] Non-existent carousel IDs
  - [ ] Invalid JWT tokens

- [ ] **Permission Issues**
  - [ ] Unauthorized approval attempts
  - [ ] Role-based access control
  - [ ] Session expiration handling

## Monitoring and Logging

### System Monitoring

- [ ] **Metrics Collection**
  - [ ] Approval rates are tracked
  - [ ] Scheduling success metrics
  - [ ] API response times monitored

- [ ] **Error Tracking**
  - [ ] Failed approvals are logged
  - [ ] Buffer API errors captured
  - [ ] System exceptions reported

### Audit Trail

- [ ] **Approval History**
  - [ ] All approval actions logged
  - [ ] User actions traceable
  - [ ] Timestamp accuracy verified

- [ ] **Content Tracking**
  - [ ] Carousel usage tracked
  - [ ] Platform posting history
  - [ ] Engagement metrics collected

## Regression Testing

### Configuration Changes

- [ ] **Schedule Updates**
  - [ ] New time slots work correctly
  - [ ] Platform rule changes apply
  - [ ] Constraint modifications work

- [ ] **Brand Updates**
  - [ ] New watermark applies
  - [ ] Color scheme changes work
  - [ ] Quiet hours updates function

### Code Changes

- [ ] **API Updates**
  - [ ] New endpoints work
  - [ ] Schema changes don't break existing clients
  - [ ] Authentication updates work

- [ ] **Scheduler Changes**
  - [ ] New selection algorithms work
  - [ ] Performance improvements don't break logic
  - [ ] Error handling remains robust

## Accessibility Testing

### Admin Interface

- [ ] **Keyboard Navigation**
  - [ ] All carousel controls accessible
  - [ ] Approval actions work with keyboard
  - [ ] Screen reader compatibility

- [ ] **Visual Design**
  - [ ] High contrast mode works
  - [ ] Color blindness considerations
  - [ ] Font scaling works

## Security Testing

### Authentication

- [ ] **Token Security**
  - [ ] JWT tokens can't be forged
  - [ ] Token expiration works
  - [ ] Secure token storage

- [ ] **Authorization**
  - [ ] Role-based permissions enforced
  - [ ] Privilege escalation prevented
  - [ ] API access controls work

### Data Protection

- [ ] **Input Validation**
  - [ ] SQL injection prevented
  - [ ] XSS attacks blocked
  - [ ] File upload security

- [ ] **Data Privacy**
  - [ ] User data protected
  - [ ] Audit logs secure
  - [ ] Sensitive data encrypted

## Deployment Testing

### Environment Setup

- [ ] **Configuration**
  - [ ] Environment variables set correctly
  - [ ] Database connections work
  - [ ] External API keys configured

- [ ] **Dependencies**
  - [ ] All packages installed
  - [ ] Version compatibility verified
  - [ ] Build process succeeds

### Migration Testing

- [ ] **Database Migrations**
  - [ ] Schema changes apply correctly
  - [ ] Data migration works
  - [ ] Rollback procedures work

- [ ] **Configuration Migration**
  - [ ] New config files load
  - [ ] Old settings migrate properly
  - [ ] Backward compatibility maintained

## Sign-off Criteria

- [ ] All unit tests pass (100% coverage)
- [ ] All integration tests pass
- [ ] End-to-end workflow completes successfully
- [ ] Performance benchmarks met
- [ ] Security scan passes
- [ ] Accessibility audit passes
- [ ] Documentation updated
- [ ] Deployment checklist complete
