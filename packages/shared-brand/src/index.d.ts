import { z } from 'zod';
export declare const BrandConfigSchema: z.ZodObject<{
    brand: z.ZodString;
    tagline: z.ZodString;
    colors: z.ZodObject<{
        primary: z.ZodString;
        secondary: z.ZodString;
        accent: z.ZodString;
        text_light: z.ZodString;
        text_dark: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        primary: string;
        secondary: string;
        accent: string;
        text_light: string;
        text_dark: string;
    }, {
        primary: string;
        secondary: string;
        accent: string;
        text_light: string;
        text_dark: string;
    }>;
    fonts: z.ZodObject<{
        primary: z.ZodString;
        secondary: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        primary: string;
        secondary: string;
    }, {
        primary: string;
        secondary: string;
    }>;
    watermark: z.ZodObject<{
        path: z.ZodString;
        opacity: z.ZodNumber;
        margin_px: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        path: string;
        opacity: number;
        margin_px: number;
    }, {
        path: string;
        opacity: number;
        margin_px: number;
    }>;
    aspect_ratios: z.ZodObject<{
        reels: z.ZodString;
        square: z.ZodString;
        landscape: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        reels: string;
        square: string;
        landscape: string;
    }, {
        reels: string;
        square: string;
        landscape: string;
    }>;
    safe_areas: z.ZodObject<{
        reels: z.ZodObject<{
            top: z.ZodNumber;
            bottom: z.ZodNumber;
            left: z.ZodNumber;
            right: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            top: number;
            bottom: number;
            left: number;
            right: number;
        }, {
            top: number;
            bottom: number;
            left: number;
            right: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        reels: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        };
    }, {
        reels: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    watermark: {
        path: string;
        opacity: number;
        margin_px: number;
    };
    brand: string;
    colors: {
        primary: string;
        secondary: string;
        accent: string;
        text_light: string;
        text_dark: string;
    };
    fonts: {
        primary: string;
        secondary: string;
    };
    tagline: string;
    aspect_ratios: {
        reels: string;
        square: string;
        landscape: string;
    };
    safe_areas: {
        reels: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        };
    };
}, {
    watermark: {
        path: string;
        opacity: number;
        margin_px: number;
    };
    brand: string;
    colors: {
        primary: string;
        secondary: string;
        accent: string;
        text_light: string;
        text_dark: string;
    };
    fonts: {
        primary: string;
        secondary: string;
    };
    tagline: string;
    aspect_ratios: {
        reels: string;
        square: string;
        landscape: string;
    };
    safe_areas: {
        reels: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        };
    };
}>;
export type BrandConfig = z.infer<typeof BrandConfigSchema>;
/**
 * Load brand configuration from YAML file
 * @param configPath - Path to the brand.yaml file (defaults to config/brand.yaml relative to cwd)
 * @returns Validated brand configuration
 */
export declare function loadBrandConfig(configPath?: string): BrandConfig;
/**
 * Get the default brand configuration
 * @returns The default brand configuration
 */
export declare function getDefaultBrandConfig(): BrandConfig;
//# sourceMappingURL=index.d.ts.map