import { useCallback, useEffect, useRef, useState } from "react"

const ACTIVATION_THRESHOLD = 50
const MIN_SCROLL_UP_THRESHOLD = 10

export function useAutoScroll(dependencies: React.DependencyList) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const previousScrollTop = useRef<number | null>(null)
  const isScrollingProgrammatically = useRef(false)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      isScrollingProgrammatically.current = true
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      // Reset flag after browser processes the scroll event
      requestAnimationFrame(() => {
        isScrollingProgrammatically.current = false
      })
    }
  }, [])

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current

      // Ignore scroll events caused by our own programmatic scroll
      if (isScrollingProgrammatically.current) {
        previousScrollTop.current = scrollTop
        return
      }

      const distanceFromBottom = Math.abs(
        scrollHeight - scrollTop - clientHeight
      )

      const isScrollingUp = previousScrollTop.current
        ? scrollTop < previousScrollTop.current
        : false

      const scrollUpDistance = previousScrollTop.current
        ? previousScrollTop.current - scrollTop
        : 0

      const isDeliberateScrollUp =
        isScrollingUp && scrollUpDistance > MIN_SCROLL_UP_THRESHOLD

      if (isDeliberateScrollUp) {
        setShouldAutoScroll(false)
      } else {
        const isScrolledToBottom = distanceFromBottom < ACTIVATION_THRESHOLD
        setShouldAutoScroll(isScrolledToBottom)
      }

      previousScrollTop.current = scrollTop
    }
  }, [])

  const handleTouchStart = useCallback(() => {
    setShouldAutoScroll(false)
  }, [])

  const resetAutoScroll = useCallback(() => {
    setShouldAutoScroll(true)
  }, [])

  useEffect(() => {
    if (containerRef.current) {
      previousScrollTop.current = containerRef.current.scrollTop
    }
  }, [])

  useEffect(() => {
    if (shouldAutoScroll) {
      requestAnimationFrame(() => {
        scrollToBottom()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  return {
    containerRef,
    scrollToBottom,
    handleScroll,
    shouldAutoScroll,
    handleTouchStart,
    resetAutoScroll,
  }
}
