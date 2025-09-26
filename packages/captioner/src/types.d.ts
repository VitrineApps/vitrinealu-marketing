import { z } from 'zod';
export type Platform = 'instagram' | 'tiktok' | 'youtube_shorts' | 'linkedin' | 'facebook';
export declare const PlatformSchema: z.ZodEnum<["instagram", "tiktok", "youtube_shorts", "linkedin", "facebook"]>;
export declare const CaptionJSONSchema: z.ZodObject<{
    platform: z.ZodEnum<["instagram", "tiktok", "youtube_shorts", "linkedin", "facebook"]>;
    caption: z.ZodString;
    hashtags: z.ZodArray<z.ZodString, "many">;
    call_to_action: z.ZodString;
    compliance_notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    platform: "instagram" | "facebook" | "tiktok" | "youtube_shorts" | "linkedin";
    caption: string;
    hashtags: string[];
    call_to_action: string;
    compliance_notes?: string | undefined;
}, {
    platform: "instagram" | "facebook" | "tiktok" | "youtube_shorts" | "linkedin";
    caption: string;
    hashtags: string[];
    call_to_action: string;
    compliance_notes?: string | undefined;
}>;
export type CaptionJSON = z.infer<typeof CaptionJSONSchema>;
export type BrandKit = {
    toneWords: string[];
    bannedHashtags: string[];
    locale: string;
};
//# sourceMappingURL=types.d.ts.map