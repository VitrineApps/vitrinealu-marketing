import { readFile } from 'fs/promises';
import exifr from 'exifr';
export async function extractExifHints(filePath) {
    try {
        const buffer = await readFile(filePath);
        const exif = await exifr.parse(buffer);
        // Infer lens from FocalLengthIn35mmFilm
        let lens = 'standard';
        if (exif.FocalLengthIn35mmFilm) {
            const focalLength = exif.FocalLengthIn35mmFilm;
            if (focalLength <= 20) {
                lens = 'ultra-wide';
            }
            else if (focalLength <= 35) {
                lens = 'wide';
            }
        }
        // Infer timeOfDay from DateTimeOriginal, assuming local UK time
        let timeOfDay = 'day';
        if (exif.DateTimeOriginal) {
            const date = new Date(exif.DateTimeOriginal);
            const hour = date.getHours();
            if ((hour >= 6 && hour <= 8) || (hour >= 18 && hour <= 20)) {
                timeOfDay = 'golden_hour';
            }
            else if (hour >= 20 || hour <= 5) {
                timeOfDay = 'night';
            }
        }
        return { lens, timeOfDay };
    }
    catch (error) {
        // Safe defaults
        return { lens: 'standard', timeOfDay: 'day' };
    }
}
