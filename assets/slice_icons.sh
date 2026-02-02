
#!/bin/zsh

INPUT_DIR="/Users/bobhopp/Sites/retroverse-icons"
OUTPUT_DIR="$INPUT_DIR/output"

mkdir -p "$OUTPUT_DIR"

echo "🔧 Starting batch PDF slicing..."
echo "Input directory: $INPUT_DIR"
echo "Output directory: $OUTPUT_DIR"

for pdf in "$INPUT_DIR"/*.pdf; do
    filename=$(basename "$pdf" .pdf)
    echo "📄 Processing $filename.pdf ..."

    convert -density 300 "$pdf" -trim +repage \
        "$OUTPUT_DIR/${filename}_%03d.png"

    echo "✅ Finished $filename.pdf"
done

echo "🎉 All icons sliced! Files saved to:"
echo "$OUTPUT_DIR"
echo "🚀 Done!"