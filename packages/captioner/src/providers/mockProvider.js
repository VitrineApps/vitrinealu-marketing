export async function generateMock(opts) {
    if (opts.platform === 'instagram') {
        return {
            platform: 'instagram',
            caption: '[MOCK instagram] Image: img_wide — img wide @ Northwest England',
            hashtags: ['#vitrinealu'],
            call_to_action: 'Request a free quote.',
            compliance_notes: 'Caption meets Instagram guidelines for length and content.',
        };
    }
    else if (opts.platform === 'linkedin') {
        return {
            platform: 'linkedin',
            caption: '[MOCK linkedin] Image: img_ultrawide — img ultrawide @ Northwest England',
            hashtags: ['#vitrinealu'],
            call_to_action: 'Request a free quote.',
            compliance_notes: 'Caption meets LinkedIn guidelines for professional tone and length.',
        };
    }
    else {
        return {
            platform: opts.platform,
            caption: `[MOCK ${opts.platform}] ${opts.brief}`,
            hashtags: ['#vitrinealu'],
            call_to_action: 'Request a free quote.',
        };
    }
}
export default { generate: generateMock };
