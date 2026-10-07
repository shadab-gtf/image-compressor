import { cn } from "@/lib/cn";

interface FaqIllustrationProps {
  className?: string;
}

const paper = "var(--sf-surface, #ffffff)";
const wash = "var(--sf-accent-soft, #fdeadd)";

/** Original pen drawing: a curious little fox figuring out its next creation. */
export function FaqIllustration({ className }: FaqIllustrationProps) {
  return (
    <svg
      width={480}
      height={300}
      viewBox="0 0 480 300"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-auto w-full", className)}
      aria-hidden="true"
      focusable="false"
    >
      {/* A loose ground line anchors the scene without enclosing it in a card. */}
      <path
        d="M109 259c41-8 163-8 239-.4 25 3-22 13-113 12-93-.5-148-7-126-11.6Z"
        fill={wash}
        stroke="none"
      />
      <path d="M74 265c76 1.9 164-1.2 247-.2m14 .3 43 .7m11 .1 17-.3" strokeWidth={2} />

      {/* Photo cards: one tucked behind another, with a little landscape. */}
      <path
        d="M337 152c28 3 53 9 80 17-4 27-12 54-21 79-27-4-54-11-79-19 5-25 11-53 20-77Z"
        fill={wash}
      />
      <path d="m393 182 12 3-12 48-11-2" strokeWidth={1.8} />
      <path
        d="M302 143c26-2.9 54-3 80-.7 3 29 3.2 61 1.6 90-27 3.8-54 3.7-80 .8-2.8-29-3.2-61-1.6-90.1Z"
        fill={paper}
      />
      <path d="M312 155c20-1.9 40-1.8 60-.3l1.6 55.6c-20 2.3-40 2.1-60 .4-1.4-18-2-38-1.6-55.7Z" strokeWidth={2.1} />
      <path d="m315 201 16-18 14 15 11-10 16 18" strokeWidth={2.4} />
      <path d="M354 163c4-1.9 8 1.1 7.6 5.1-.4 4-5.5 6.2-8.3 3.1-2.6-2.5-2-6.3.7-8.2Z" fill={wash} strokeWidth={2} />
      <path d="M316 222c11 .8 23 1 33 .5m8-.1 12-.7" strokeWidth={2} />

      {/* Question bubble, drawn as strokes so it needs no text or font. */}
      <path
        d="M306 33c20-8 53-7 73 3 22 10 28 29 21 48-6 16-26 24-48 22l-23 17 3-21c-23-4-38-15-39-33-1-15 3-27 13-36Z"
        fill={paper}
      />
      <path
        d="M335 52c2-12 20-14 26-4 8 13-13 15-13 26"
        strokeWidth={5}
      />
      <path d="m347.6 87 .2.1" strokeWidth={6} />
      <path d="m411 48 12-4m-13-8 7-8m-2 34 11 2" strokeWidth={2.4} />

      {/* The fox's tail wraps around its feet; the tip has a paper-colored patch. */}
      <path
        d="M181 222c-18 1-31-5-44-16-11-9-20-24-25-39-18 16-24 37-14 56 14 27 50 37 78 26Z"
        fill={wash}
      />
      <path
        d="M112 167c-13 12-20 27-18 41l13-5 3 11 11-6 5 11 12-12c-12-10-20-25-26-40Z"
        fill={paper}
        strokeWidth={2.4}
      />

      {/* Small, uneven shoes and a soft body keep the mascot friendly. */}
      <path d="m178 238-7 17-13 3c-5 1-7 5-4 7l27-.7 13-23m25-1 7 15 17 3c4 1 7 4 4 6l-27-.5-12-21" fill={paper} />
      <path
        d="M177 162c-13 20-21 47-19 70 15 17 46 21 74 5 7-25 1-53-13-75Z"
        fill={paper}
      />
      <path d="M175 200c-4 11-5 24-.9 35 11 6 27 7 40 1 4-11 2-25-4-37" fill={wash} stroke="none" />
      <path d="M174 241c13 5 28 5 42 0" strokeWidth={1.8} />

      {/* One paw is thinking; the other offers the finished photo. */}
      <path d="M225 186c12 13 24 13 35 6 13-8 23-19 34-21" />
      <path d="M292 170c4-4 8-4 9-1 2 3-1 5-5 6m-.9-1.8c5-.8 8 1 7 4-1 3-6 2-9.5.8" fill={paper} strokeWidth={2.7} />
      <path d="M163 201c-14-1-22-9-18-22 2-7 7-13 14-17" />
      <path d="M156 166c-3-5-1-11 3-10 3 0 3 4 2 7m-1-2c1-5 5-7 7-4 2 3-1 8-4 11" fill={paper} strokeWidth={2.7} />

      {/* An asymmetrical face, pointed ears, and generous smile. */}
      <path
        d="M153 119c-11-15-11-38-3-57 15 7 29 19 36 34 14-5 28-4 40 1 7-15 17-26 30-32 8 23 7 43-4 61 5 15-4 32-21 43-19 13-43 13-61 2-21-12-29-32-17-52Z"
        fill={wash}
      />
      <path d="m153 79 7 24 12-5m70-2 8-15 1 22" strokeWidth={2} />
      <path
        d="M152 134c17 1 31 8 47 18 18-14 34-18 54-18-2 15-11 27-25 35-19 10-39 10-56 0-12-8-20-21-20-35Z"
        fill={paper}
        stroke="none"
      />
      <path d="M170 115c4-3 8-4 12-2m32-.9c5-2 10-1 13 2" strokeWidth={2.4} />
      <ellipse cx={178} cy={127} rx={3.4} ry={4.5} fill="currentColor" stroke="none" transform="rotate(-9 178 127)" />
      <ellipse cx={220} cy={126} rx={3.2} ry={4.3} fill="currentColor" stroke="none" transform="rotate(8 220 126)" />
      <path d="M193 136c4-1 9-1 13 .2l-6 6.8Z" fill="currentColor" strokeWidth={1.7} />
      <path d="M182 147c6 15 26 16 36-1" />
      <path d="M166 139l-4-1m66 1 5-2" strokeWidth={2} />

      {/* A few airy pen marks balance the open space around the characters. */}
      <path d="M80 107c1 6 5 10 11 11-6 1-10 5-12 11-1-6-5-10-11-12 6-1 10-5 12-10Z" fill={wash} strokeWidth={2.2} />
      <path d="m107 72 5 7m-15 5 8 3M277 127l5 5m-4-15 8 1" strokeWidth={2.3} />
      <path d="M413 228c-3 7-5 16-4 25m.1-7c-8-2-12-6-13-12 8 .5 12 4 13 12Zm.9-6c7-1 12-5 13-11-8 .4-12 4-13 11Z" strokeWidth={2.2} />
      <path d="M71 248c4-4 8-4 12-1m-24 7 7 1" strokeWidth={2} />
    </svg>
  );
}
