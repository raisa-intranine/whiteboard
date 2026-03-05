import { useEffect, useRef } from 'react'
import './LaserPointer.css'

const LaserPointer = ({ active, containerRef }) => {
  const overlayRef   = useRef(null)   
  const ctxRef       = useRef(null)
  const trailRef     = useRef([])     
  const rafRef       = useRef(null)
  const posRef       = useRef(null)   
  const lastTimeRef  = useRef(null)

  useEffect(() => {
    if (!containerRef?.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const el = overlayRef.current;
        if (el) {
          el.width = entry.contentRect.width;
          el.height = entry.contentRect.height;
          ctxRef.current = el.getContext('2d');
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [containerRef]);

  useEffect(() => {
    if (!active || !containerRef?.current) {
      posRef.current = null;
      return;
    }

    const onMove = (e) => {
      const rect = containerRef.current.getBoundingClientRect();
      posRef.current = { 
        x: e.clientX - rect.left, 
        y: e.clientY - rect.top 
      };
    }

    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [active, containerRef]);

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current)
      const ctx = ctxRef.current
      if (ctx && overlayRef.current) {
        ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
      }
      trailRef.current = []
      lastTimeRef.current = null
      return
    }

    const TRAIL_MAX    = 28     
    const TRAIL_LIFE   = 400    
    const DOT_RADIUS   = 7      
    const TRAIL_RADIUS = 5      

    const draw = (timestamp) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const dt = timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp

      const ctx = ctxRef.current
      const el  = overlayRef.current
      if (!ctx || !el) { rafRef.current = requestAnimationFrame(draw); return }

      ctx.clearRect(0, 0, el.width, el.height)

      const pos = posRef.current
      if (!pos) { rafRef.current = requestAnimationFrame(draw); return }

      trailRef.current.push({ x: pos.x, y: pos.y, ts: timestamp })
      trailRef.current = trailRef.current.filter(p => timestamp - p.ts < TRAIL_LIFE)

      if (trailRef.current.length > TRAIL_MAX) {
        trailRef.current = trailRef.current.slice(-TRAIL_MAX)
      }

      trailRef.current.forEach((pt, i) => {
        const age      = (timestamp - pt.ts) / TRAIL_LIFE   
        const alpha    = (1 - age) * 0.55
        const radius   = TRAIL_RADIUS * (1 - age * 0.6)

        ctx.beginPath()
        ctx.arc(pt.x, pt.y, Math.max(0.5, radius), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 30, 30, ${alpha})`
        ctx.fill()
      })

      const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, DOT_RADIUS * 3)
      grad.addColorStop(0,   'rgba(255, 60, 60, 0.5)')
      grad.addColorStop(0.4, 'rgba(255, 30, 30, 0.25)')
      grad.addColorStop(1,   'rgba(255,  0,  0, 0)')

      ctx.beginPath()
      ctx.arc(pos.x, pos.y, DOT_RADIUS * 3, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()

      ctx.beginPath()
      ctx.arc(pos.x, pos.y, DOT_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = '#ff1e1e'
      ctx.shadowColor   = '#ff0000'
      ctx.shadowBlur    = 12
      ctx.fill()
      ctx.shadowBlur = 0

      ctx.beginPath()
      ctx.arc(pos.x - 2, pos.y - 2, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fill()

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active])

  return (
    <canvas
      ref={overlayRef}
      className={`laser-overlay ${active ? 'laser-active' : ''}`}
    />
  )
}

export default LaserPointer