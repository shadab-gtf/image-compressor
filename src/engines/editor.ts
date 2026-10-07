import type {
  BackgroundFill,
  CropTransform,
  MaskStroke,
} from "../types/editor.ts";
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function paintStroke(
  context: Context,
  stroke: MaskStroke,
  width: number,
  height: number,
): void {
  context.save();
  context.globalCompositeOperation =
    stroke.mode === "erase" ? "destination-out" : "source-over";
  context.strokeStyle = context.fillStyle = "#fff";
  context.lineCap = context.lineJoin = "round";
  context.globalAlpha = stroke.opacity ?? 1;
  for (let index = 0; index < stroke.points.length; index++) {
    const point = stroke.points[index]!;
    const previous = stroke.points[Math.max(0, index - 1)]!;
    const diameter = Math.max(
      0.5,
      stroke.size * width * Math.max(0.15, point.pressure),
    );
    const hardness = stroke.hardness ?? 1;
    if (hardness < 1) {
      const dx = (point.x - previous.x) * width;
      const dy = (point.y - previous.y) * height;
      const steps = Math.max(
        1,
        Math.ceil(Math.hypot(dx, dy) / Math.max(1, diameter / 5)),
      );
      for (let step = index ? 1 : 0; step <= steps; step++) {
        const x = previous.x * width + (dx * step) / steps;
        const y = previous.y * height + (dy * step) / steps;
        const brush = context.createRadialGradient(
          x,
          y,
          (diameter * hardness) / 2,
          x,
          y,
          diameter / 2,
        );
        brush.addColorStop(0, "#fff");
        brush.addColorStop(1, "#fff0");
        context.fillStyle = brush;
        context.fillRect(
          x - diameter / 2,
          y - diameter / 2,
          diameter,
          diameter,
        );
      }
      continue;
    }
    context.lineWidth = diameter;
    context.beginPath();
    context.moveTo(previous.x * width, previous.y * height);
    context.lineTo(point.x * width, point.y * height);
    context.stroke();
    context.beginPath();
    context.arc(
      point.x * width,
      point.y * height,
      diameter / 2,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.restore();
}

export function fillBackground(
  context: Context,
  width: number,
  height: number,
  background: BackgroundFill,
  image?: CanvasImageSource,
): void {
  if (background.kind === "transparent") return;
  if (background.kind === "image") {
    if (!image) return;
    const dimensions = image as ImageBitmap;
    const ratio = Math.max(
      width / dimensions.width,
      height / dimensions.height,
    );
    context.drawImage(
      image,
      (width - dimensions.width * ratio) / 2,
      (height - dimensions.height * ratio) / 2,
      dimensions.width * ratio,
      dimensions.height * ratio,
    );
    return;
  }
  if (background.kind === "solid") context.fillStyle = background.color;
  else {
    const radians = (background.angle * Math.PI) / 180;
    const radius =
      (Math.abs(width * Math.cos(radians)) +
        Math.abs(height * Math.sin(radians))) /
      2;
    const dx = Math.cos(radians) * radius;
    const dy = Math.sin(radians) * radius;
    const gradient = context.createLinearGradient(
      width / 2 - dx,
      height / 2 - dy,
      width / 2 + dx,
      height / 2 + dy,
    );
    gradient.addColorStop(0, background.color);
    gradient.addColorStop(1, background.endColor);
    context.fillStyle = gradient;
  }
  context.fillRect(0, 0, width, height);
}

export function cropGeometry(
  width: number,
  height: number,
  transform: CropTransform,
) {
  const s = transform.selection;
  if (
    ![
      s.x,
      s.y,
      s.width,
      s.height,
      transform.rotation,
      transform.straighten,
    ].every(Number.isFinite) ||
    s.x < 0 ||
    s.y < 0 ||
    s.width <= 0 ||
    s.height <= 0 ||
    s.x + s.width > 1.000001 ||
    s.y + s.height > 1.000001 ||
    Math.abs(transform.straighten) > 15 ||
    ![0, 90, 180, 270].includes(transform.rotation)
  )
    throw new Error(
      "The crop settings are invalid. Reset the selection and try again.",
    );
  const x = Math.min(width - 1, Math.round(s.x * width));
  const y = Math.min(height - 1, Math.round(s.y * height));
  const cropWidth = Math.max(
    1,
    Math.min(width - x, Math.round(s.width * width)),
  );
  const cropHeight = Math.max(
    1,
    Math.min(height - y, Math.round(s.height * height)),
  );
  const radians = ((transform.rotation + transform.straighten) * Math.PI) / 180;
  // Snap near-zero trig values so 90-degree rotations do not gain one pixel.
  const cosine =
    Math.abs(Math.cos(radians)) < 1e-10 ? 0 : Math.abs(Math.cos(radians));
  const sine =
    Math.abs(Math.sin(radians)) < 1e-10 ? 0 : Math.abs(Math.sin(radians));
  return {
    x,
    y,
    cropWidth,
    cropHeight,
    radians,
    width: Math.ceil(cropWidth * cosine + cropHeight * sine),
    height: Math.ceil(cropWidth * sine + cropHeight * cosine),
  };
}
