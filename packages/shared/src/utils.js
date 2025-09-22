import crypto from 'node:crypto';
export const nowIso = () => new Date().toISOString();
export const createId = (prefix = 'job') => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
export const safeJsonParse = (value) => {
    try {
        return JSON.parse(value);
    }
    catch (error) {
        return null;
    }
};
//# sourceMappingURL=utils.js.map