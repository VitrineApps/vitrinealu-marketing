export function clampCaptionLength(platform, caption) {
    const words = caption.split(/\s+/);
    let maxWords;
    switch (platform) {
        case 'instagram':
        case 'tiktok':
            maxWords = 180;
            break;
        case 'youtube_shorts':
            maxWords = 100;
            break;
        case 'linkedin':
            maxWords = 140;
            break;
        case 'facebook':
            maxWords = 120;
            break;
        default:
            maxWords = 100;
    }
    if (words.length <= maxWords) {
        return caption;
    }
    return words.slice(0, maxWords).join(' ') + '...';
}
export function clampByPlatform(platform, text) {
    return clampCaptionLength(platform, text);
}
export function filterBannedWords(caption, banned) {
    let filtered = caption;
    for (const word of banned) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        filtered = filtered.replace(regex, '[FILTERED]');
    }
    return filtered;
}
export function applyBanlist(hashtags, banned) {
    return hashtags.filter(tag => !banned.some(bannedWord => tag.toLowerCase().includes(bannedWord.toLowerCase().replace('#', ''))));
}
export const removeEmojis = (s) => s.replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '');
