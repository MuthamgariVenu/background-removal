/**
 * Client-side person detection + per-person mask utilities.
 * Uses TensorFlow.js BodyPix (dynamically imported — never runs on server).
 */

export interface DetectedPerson {
  id: number;
  /** Normalised bounds, all values in [0, 1] */
  bounds: { x: number; y: number; w: number; h: number };
  /** Flat Uint8Array of length imgW*imgH. Value 1 = this person's pixel. */
  pixelMask: Uint8Array;
  imgW: number;
  imgH: number;
}

// Ignore detections that cover less than 0.05 % of the image
const MIN_COVERAGE = 0.0005;

/**
 * Run BodyPix multi-person segmentation on an already-loaded HTMLImageElement.
 * Returns one DetectedPerson per person found (largest first).
 */
export async function detectPersons(
  imgEl: HTMLImageElement
): Promise<DetectedPerson[]> {
  // --- Bootstrap TensorFlow.js ---
  const tf = await import("@tensorflow/tfjs-core");

  let backendReady = false;
  try {
    await import("@tensorflow/tfjs-backend-webgl");
    await tf.setBackend("webgl");
    await tf.ready();
    backendReady = true;
  } catch {
    /* WebGL unavailable — fall through to CPU */
  }

  if (!backendReady) {
    await import("@tensorflow/tfjs-backend-cpu");
    await tf.setBackend("cpu");
    await tf.ready();
  }

  // --- Load BodyPix segmenter ---
  const { createSegmenter, SupportedModels } = await import(
    "@tensorflow-models/body-segmentation"
  );

  const segmenter = await createSegmenter(SupportedModels.BodyPix, {
    architecture: "MobileNetV1",
    outputStride: 16,
    multiplier: 0.75,
    quantBytes: 2,
  });

  // --- Run segmentation ---
  const segmentations = await segmenter.segmentPeople(imgEl, {
    multiSegmentation: true,
    segmentBodyParts: false,
    flipHorizontal: false,
  });

  segmenter.dispose();

  const W = imgEl.naturalWidth;
  const H = imgEl.naturalHeight;
  const minPixels = W * H * MIN_COVERAGE;

  const persons: DetectedPerson[] = [];

  for (const seg of segmentations) {
    const maskImgData = await seg.mask.toImageData();
    const mW = maskImgData.width;
    const mH = maskImgData.height;

    const pixelMask = new Uint8Array(W * H);
    let count = 0;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;

    for (let my = 0; my < mH; my++) {
      for (let mx = 0; mx < mW; mx++) {
        const mi = (my * mW + mx) * 4;
        // R channel holds label (1 = person), A channel 255 when person
        const isMasked =
          maskImgData.data[mi] > 0 || maskImgData.data[mi + 3] > 0;

        if (isMasked) {
          const ix = Math.min(Math.round((mx / mW) * W), W - 1);
          const iy = Math.min(Math.round((my / mH) * H), H - 1);
          const ii = iy * W + ix;
          if (!pixelMask[ii]) {
            pixelMask[ii] = 1;
            count++;
            if (ix < x0) x0 = ix;
            if (iy < y0) y0 = iy;
            if (ix > x1) x1 = ix;
            if (iy > y1) y1 = iy;
          }
        }
      }
    }

    if (count < minPixels) continue;

    persons.push({
      id: 0, // assigned below after sorting
      bounds: {
        x: x0 / W,
        y: y0 / H,
        w: (x1 - x0) / W,
        h: (y1 - y0) / H,
      },
      pixelMask,
      imgW: W,
      imgH: H,
    });
  }

  // Sort left-to-right (by horizontal centre) for predictable numbering
  persons.sort(
    (a, b) => (a.bounds.x + a.bounds.w / 2) - (b.bounds.x + b.bounds.w / 2)
  );
  persons.forEach((p, i) => (p.id = i + 1));

  return persons;
}

/**
 * Takes the transparent PNG blob URL returned by /api/remove-bg and zeros out
 * every pixel that does NOT belong to any of the keepIds persons.
 * Returns a new blob URL with the filtered result.
 */
export async function applyPersonFilter(
  transparentBlobUrl: string,
  persons: DetectedPerson[],
  keepIds: Set<number>
): Promise<string> {
  // No filtering needed when keeping everyone
  if (keepIds.size === persons.length) return transparentBlobUrl;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      const cW = canvas.width;
      const cH = canvas.height;

      // Build union mask for all kept persons
      const keepMask = new Uint8Array(cW * cH);

      for (const person of persons) {
        if (!keepIds.has(person.id)) continue;

        const exactMatch = person.imgW === cW && person.imgH === cH;

        if (exactMatch) {
          // 1-to-1 — just OR the masks directly
          for (let i = 0; i < keepMask.length; i++) {
            if (person.pixelMask[i]) keepMask[i] = 1;
          }
        } else {
          // Scale mask coords → canvas coords
          for (let py = 0; py < person.imgH; py++) {
            for (let px = 0; px < person.imgW; px++) {
              if (person.pixelMask[py * person.imgW + px]) {
                const cx = Math.min(
                  Math.round((px / person.imgW) * cW),
                  cW - 1
                );
                const cy = Math.min(
                  Math.round((py / person.imgH) * cH),
                  cH - 1
                );
                keepMask[cy * cW + cx] = 1;
              }
            }
          }
        }
      }

      // Zero alpha for pixels outside the union mask
      for (let i = 0; i < cW * cH; i++) {
        if (!keepMask[i]) d[i * 4 + 3] = 0;
      }

      ctx.putImageData(imageData, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(URL.createObjectURL(blob));
          else reject(new Error("Canvas export failed"));
        },
        "image/png"
      );
    };
    img.onerror = () => reject(new Error("Failed to load result image"));
    img.src = transparentBlobUrl;
  });
}
