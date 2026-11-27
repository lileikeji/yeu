<script setup lang="ts">
import {
  BURST_PARTICLE_PRESETS,
  type VoteBurstItem
} from '~/utils/vote-burst'

defineProps<{
  bursts: readonly VoteBurstItem[]
}>()

const VARIANT_ROTATE_DEG = [0, -10, 12] as const
</script>

<template>
  <Teleport to="body">
    <div
      v-if="bursts.length > 0"
      class="vote-burst-layer"
      aria-hidden="true"
    >
      <div
        v-for="burst in bursts"
        :key="burst.id"
        class="vote-burst-anchor"
        :style="{
          transform: `translate3d(${burst.x}px, ${burst.y}px, 0) rotate(${VARIANT_ROTATE_DEG[burst.variant]}deg)`
        }"
      >
        <span class="vote-burst-ring border-rose-500" />
        <span class="vote-burst-ring-inner border-amber-400" />

        <span
          class="vote-burst-badge"
          :style="{
            transform: `rotate(${-VARIANT_ROTATE_DEG[burst.variant]}deg)`
          }"
        >
          <span class="vote-burst-badge-pill bg-rose-600 text-white">
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              class="vote-burst-badge-icon"
              aria-hidden="true"
            >
              <path d="M8 14.2s-5.4-3.4-5.4-7.4A3.2 3.2 0 0 1 8 4.4a3.2 3.2 0 0 1 5.4 2.4c0 4-5.4 7.4-5.4 7.4Z" />
            </svg>
            <span>{{ burst.label }}</span>
          </span>
        </span>

        <span
          v-for="(particle, idx) in BURST_PARTICLE_PRESETS"
          :key="idx"
          class="vote-burst-particle"
          :style="{
            'color': particle.color,
            '--dx': `${particle.dx}px`,
            '--dy': `${particle.dy}px`,
            '--rot': `${particle.rot}deg`,
            '--ps': particle.scale,
            '--pdelay': `${particle.delayMs}ms`
          }"
        >
          <svg
            v-if="particle.kind === 'heart'"
            viewBox="0 0 16 16"
            fill="currentColor"
            class="vote-burst-svg"
            aria-hidden="true"
          >
            <path d="M8 14.2s-5.4-3.4-5.4-7.4A3.2 3.2 0 0 1 8 4.4a3.2 3.2 0 0 1 5.4 2.4c0 4-5.4 7.4-5.4 7.4Z" />
          </svg>
          <svg
            v-else-if="particle.kind === 'thumb'"
            viewBox="0 0 16 16"
            fill="currentColor"
            class="vote-burst-svg"
            aria-hidden="true"
          >
            <path d="M5.2 6.8V14H2.8a1 1 0 0 1-1-1V7.8a1 1 0 0 1 1-1h2.4Zm1.3 0 2.1-4.3a1.1 1.1 0 0 1 2 .5v2.6h2.6a1.3 1.3 0 0 1 1.3 1.5l-.8 5.2a1.4 1.4 0 0 1-1.4 1.2H6.5V6.8Z" />
          </svg>
          <svg
            v-else-if="particle.kind === 'note'"
            viewBox="0 0 16 16"
            fill="currentColor"
            class="vote-burst-svg"
            aria-hidden="true"
          >
            <path d="M12.5 2.2v8.2a2.4 2.4 0 1 1-1.4-2.2V4.7L6.5 5.9v5.9a2.4 2.4 0 1 1-1.4-2.2V4.4l7.4-2.2Z" />
          </svg>
          <svg
            v-else
            viewBox="0 0 16 16"
            fill="currentColor"
            class="vote-burst-svg"
            aria-hidden="true"
          >
            <path d="M8 1.4 9.5 6.5 14.6 8 9.5 9.5 8 14.6 6.5 9.5 1.4 8 6.5 6.5 8 1.4Z" />
          </svg>
        </span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.vote-burst-layer {
  position: fixed;
  inset: 0;
  z-index: 120;
  pointer-events: none;
  overflow: hidden;
}

.vote-burst-anchor {
  position: fixed;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
}

.vote-burst-ring,
.vote-burst-ring-inner {
  position: absolute;
  left: -26px;
  top: -26px;
  width: 52px;
  height: 52px;
  border-radius: 9999px;
  pointer-events: none;
}

.vote-burst-ring {
  border-width: 2.5px;
  border-style: solid;
  animation: vote-burst-ring 480ms var(--ease-soft-fade) forwards;
}

.vote-burst-ring-inner {
  border-width: 2px;
  border-style: solid;
  animation: vote-burst-ring 440ms var(--ease-soft-fade) 55ms both;
}

.vote-burst-badge {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: center;
}

.vote-burst-badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.1;
  white-space: nowrap;
  transform: translate3d(-50%, -50%, 0);
  animation: vote-burst-float 780ms var(--ease-soft-fade) forwards;
}

.vote-burst-badge-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.vote-burst-particle {
  position: absolute;
  left: -8px;
  top: -8px;
  width: 16px;
  height: 16px;
  animation: vote-burst-fly 740ms var(--ease-sheet) var(--pdelay, 0ms) both;
}

.vote-burst-svg {
  width: 100%;
  height: 100%;
  display: block;
}

@keyframes vote-burst-ring {
  0% {
    opacity: 0.9;
    transform: scale(0.35);
  }
  100% {
    opacity: 0;
    transform: scale(2.2);
  }
}

@keyframes vote-burst-float {
  0% {
    opacity: 0;
    transform: translate3d(-50%, -40%, 0) scale(0.65);
  }
  20% {
    opacity: 1;
    transform: translate3d(-50%, -140%, 0) scale(1.12);
  }
  58% {
    opacity: 1;
    transform: translate3d(-50%, -215%, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate3d(-50%, -265%, 0) scale(0.92);
  }
}

@keyframes vote-burst-fly {
  0% {
    opacity: 0;
    transform: translate3d(0, 0, 0) scale(0.35) rotate(0deg);
  }
  18% {
    opacity: 1;
    transform: translate3d(calc(var(--dx) * 0.45), calc(var(--dy) * 0.45), 0) scale(calc(var(--ps, 1) * 1.15)) rotate(calc(var(--rot) * 0.4));
  }
  68% {
    opacity: 1;
    transform: translate3d(var(--dx), var(--dy), 0) scale(var(--ps, 1)) rotate(var(--rot));
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--dx), calc(var(--dy) + 12px), 0) scale(0.45) rotate(var(--rot));
  }
}

@media (prefers-reduced-motion: reduce) {
  .vote-burst-ring,
  .vote-burst-ring-inner,
  .vote-burst-particle {
    display: none;
  }

  .vote-burst-badge-pill {
    animation: vote-burst-fade-only 520ms ease-out forwards;
  }

  @keyframes vote-burst-fade-only {
    0% {
      opacity: 0;
      transform: translate3d(-50%, -110%, 0);
    }
    25% {
      opacity: 1;
      transform: translate3d(-50%, -125%, 0);
    }
    100% {
      opacity: 0;
      transform: translate3d(-50%, -140%, 0);
    }
  }
}
</style>
