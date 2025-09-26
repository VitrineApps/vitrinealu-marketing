import { CaptionJSON, Platform } from '../types.js';
export declare function generateMock(opts: {
    platform: Platform;
    brief: string;
    productTags: string[];
    location?: string;
    features?: string[];
    brandTone?: string[];
    seed?: number;
}): Promise<CaptionJSON>;
declare const _default: {
    generate: typeof generateMock;
};
export default _default;
//# sourceMappingURL=mockProvider.d.ts.map