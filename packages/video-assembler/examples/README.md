# Video Assembler Examples

This directory contains examples for using the video assembler package.

## Sample Job

The `sample-job/` directory contains a complete example job with:

- `captions.json`: Job configuration with 3 clips, Ken Burns effects, and captions
- Place your source images (`image1.jpg`, `image2.jpg`, `image3.jpg`) in this directory
- Optional: Add `audio.mp3` for background music

## Usage

1. Copy the `sample-job` directory to your project
2. Add your source images
3. Modify `captions.json` as needed
4. Run the assembler:

```bash
vassemble assemble ./sample-job ./output.mp4
```

## Configuration Examples

See `captions.example.json` for additional configuration examples including different platforms and effect combinations.
