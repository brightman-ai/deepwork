// A timeline may be moved by initial positioning, round navigation, session restore,
// or an actual human scroll. Backward history loading must only react to the last one:
// direction alone would make a restored scrollTop=0 silently fetch the whole archive.
export const TIMELINE_NEAR_START_PX = 320

export function isTimelineNearStart(top: number, threshold = TIMELINE_NEAR_START_PX): boolean {
  return top <= threshold
}

export function shouldEmitTimelineNearStart(input: {
  top: number
  previousTop: number
  intentActive: boolean
  threshold?: number
}): boolean {
  const threshold = input.threshold ?? TIMELINE_NEAR_START_PX
  return input.intentActive
    && isTimelineNearStart(input.top, threshold)
    && input.previousTop - input.top >= 1
}
