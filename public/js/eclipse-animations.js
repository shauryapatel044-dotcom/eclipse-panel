/**
 * Eclipse Panel - Professional Animation & Interaction Engine
 * Features:
 *  - Interactive 3D Perspective Tilt on Cards (Framer/Awwwards style)
 *  - 60fps Smooth Rolling Number Counter (Lerp Easing)
 *  - Ambient Cyber Particle / Neural Constellation Canvas
 *  - Magnetic Button Physics
 *  - Live Oscilloscope / Telemetry Pulse Canvas
 *  - Toast Notification System with Spring Physics
 */

(function () {
  'use strict';

  // 1. NUMBER COUNTER ANIMATION (60fps Spring Lerp)
  function animateCounter(element, targetValue, duration = 1200, decimals = 0, suffix = '') {
    if (!element) return;
    const startValue = parseFloat(element.getAttribute('data-current-val') || element.innerText.replace(/[^0-9.]/g, '') || 0);
    const endValue = parseFloat(targetValue);
    if (isNaN(endValue)) {
      element.innerText = targetValue + suffix;
      return;
    }

    element.setAttribute('data-current-val', endValue);
    const startTime = performance.now();

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease Out Quart (Framer style spring deceleration)
      const ease = 1 - Math.pow(1 - progress, 4);
      const current = startValue + (endValue - startValue) * ease;

      element.innerText = (decimals > 0 ? current.toFixed(decimals) : Math.round(current)) + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.innerText = (decimals > 0 ? endValue.toFixed(decimals) : Math.round(endValue)) + suffix;
      }
    }
    requestAnimationFrame(update);
  }

  // 2. 3D TILT EFFECT FOR CARDS
  function init3DTilt(selector = '.metric-card, .content-section, .console-wrapper') {
    const cards = document.querySelectorAll(selector);

    cards.forEach(card => {
      // Add perspective parent
      card.style.transformStyle = 'preserve-3d';
      card.style.transition = 'transform 0.15s ease-out, box-shadow 0.25s ease';

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -7; // Max 7 deg
        const rotateY = ((x - centerX) / centerX) * 7;

        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
        card.style.boxShadow = `0 18px 45px rgba(0, 0, 0, 0.7), 0 0 35px rgba(239, 68, 68, 0.22)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
        card.style.boxShadow = '';
      });
    });
  }

  // 3. MAGNETIC BUTTONS (Framer micro-interaction)
  function initMagneticButtons(selector = '.btn-primary, .btn-secondary, .brand-logo-icon') {
    const buttons = document.querySelectorAll(selector);

    buttons.forEach(btn => {
      btn.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease';

      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - (rect.left + rect.width / 2);
        const y = e.clientY - (rect.top + rect.height / 2);
        btn.style.transform = `translate(${x * 0.22}px, ${y * 0.22}px)`;
      });

      btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'translate(0px, 0px)';
      });
    });
  }

  // 4. AMBIENT CYBER CONSTELLATION CANVAS
  function initCyberCanvas() {
    let canvas = document.getElementById('ambient-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'ambient-canvas';
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '0';
      canvas.style.opacity = '0.35';
      document.body.insertBefore(canvas, document.body.firstChild);
    }

    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];
    const particleCount = 45;
    let mouse = { x: -1000, y: -1000 };

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    window.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    });

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        size: Math.random() * 2 + 1,
        color: Math.random() > 0.4 ? 'rgba(239, 68, 68,' : 'rgba(255, 255, 255,'
      });
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + '0.7)';
        ctx.fill();

        // Connect nearby particles
        for (let j = i + 1; j < particleCount; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(239, 68, 68, ${(1 - dist / 120) * 0.18})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // Connect to cursor
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = `rgba(239, 68, 68, ${(1 - dist / 150) * 0.35})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      requestAnimationFrame(animate);
    }
    animate();
  }

  // 5. TOAST NOTIFICATION ENGINE (Framer Motion spring pop-up)
  function showToast(message, type = 'info') {
    let container = document.getElementById('eclipse-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'eclipse-toast-container';
      container.style.position = 'fixed';
      container.style.bottom = '24px';
      container.style.right = '24px';
      container.style.zIndex = '9999';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '10px';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'eclipse-toast';
    toast.style.pointerEvents = 'auto';
    toast.style.background = '#12141C';
    toast.style.border = type === 'error' ? '1px solid #EF4444' : '1px solid rgba(239, 68, 68, 0.4)';
    toast.style.boxShadow = '0 15px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(239, 68, 68, 0.25)';
    toast.style.color = '#FFFFFF';
    toast.style.padding = '12px 18px';
    toast.style.borderRadius = '12px';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = '600';
    toast.style.fontFamily = 'var(--font-mono)';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.transform = 'translateY(20px) scale(0.9)';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';

    const icon = type === 'error' ? '⚠️' : '⚡';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    // Spring entrance
    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0) scale(1)';
      toast.style.opacity = '1';
    });

    // Dismiss
    setTimeout(() => {
      toast.style.transform = 'translateY(10px) scale(0.95)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 3800);
  }

  // 6. LIVE OSCILLOSCOPE WAVEFORM CANVAS
  function initOscilloscope(canvasId = 'telemetry-oscilloscope', getLoadFn = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = canvas.width = canvas.parentElement.clientWidth || 300;
    let height = canvas.height = 48;
    let phase = 0;

    window.addEventListener('resize', () => {
      width = canvas.width = canvas.parentElement.clientWidth || 300;
    });

    function renderWave() {
      ctx.clearRect(0, 0, width, height);

      const load = getLoadFn ? getLoadFn() : 35;
      const amplitude = Math.max(4, (load / 100) * (height / 2 - 4));
      const frequency = 0.04 + (load / 100) * 0.04;
      phase += 0.05 + (load / 100) * 0.06;

      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#EF4444';
      ctx.shadowColor = '#EF4444';
      ctx.shadowBlur = 12;

      for (let x = 0; x < width; x++) {
        const y = height / 2 + Math.sin(x * frequency + phase) * amplitude * Math.sin(x / width * Math.PI);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      requestAnimationFrame(renderWave);
    }
    renderWave();
  }

  // Expose to window
  window.EclipseAnimations = {
    animateCounter,
    init3DTilt,
    initMagneticButtons,
    initCyberCanvas,
    showToast,
    initOscilloscope
  };

  // Auto-init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    initCyberCanvas();
    init3DTilt();
    initMagneticButtons();
  });
})();
