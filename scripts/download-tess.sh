#!/bin/bash
# Download eng.traineddata for Tesseract if missing
set -e
if [ -f "eng.traineddata" ]; then
  echo "eng.traineddata already present"
  exit 0
fi
echo "Downloading eng.traineddata..."
curl -L -o eng.traineddata https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata
echo "Done: $(du -h eng.traineddata | cut -f1)"
