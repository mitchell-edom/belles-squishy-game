import { GymnasticsGame } from './game';
import { gameAudio } from './audio';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize the game
  const game = new GymnasticsGame('game-canvas');

  // Focus canvas by default on non-touch devices so keyboard inputs work immediately
  const canvas = document.getElementById('game-canvas');
  if (canvas && !('ontouchstart' in window)) {
    canvas.focus();
  }

  // 1. Sleek Floating Modals Control
  const openModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('visible');
  };

  const closeModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove('visible');
      if (id === 'squishy-viewer-modal') {
        game.closeSquishyViewer();
      }
      // Re-focus canvas so keyboard inputs keep working
      canvas?.focus();
    }
  };

  document.getElementById('btn-toggle-customizer')?.addEventListener('click', () => openModal('customizer-modal'));
  document.getElementById('btn-close-customizer')?.addEventListener('click', () => closeModal('customizer-modal'));

  document.getElementById('btn-toggle-collection')?.addEventListener('click', () => {
    game.initCollectionCanvases();
    game.updateCollectionUI();
    openModal('collection-modal');
  });
  document.getElementById('btn-close-collection')?.addEventListener('click', () => closeModal('collection-modal'));

  document.getElementById('btn-toggle-help')?.addEventListener('click', () => openModal('help-modal'));
  document.getElementById('btn-close-help')?.addEventListener('click', () => closeModal('help-modal'));

  document.getElementById('btn-close-viewer')?.addEventListener('click', () => {
    closeModal('squishy-viewer-modal');
  });

  // Close dismissible modals on clicking outside the card (never dismiss revive modal accidentally)
  window.addEventListener('click', (e) => {
    if (
      e.target.classList.contains('modal-overlay') &&
      e.target.id !== 'revive-modal'
    ) {
      closeModal(e.target.id);
    }
  });

  // Close dismissible modals on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const dismissibleIds = ['squishy-viewer-modal', 'customizer-modal', 'collection-modal', 'help-modal'];
    for (const id of dismissibleIds) {
      const modal = document.getElementById(id);
      if (modal && modal.classList.contains('visible')) {
        closeModal(id);
        break;
      }
    }
  });

  // 2. Character Customization updates
  const skinInput = document.getElementById('skin-color');
  const hairColorInput = document.getElementById('hair-color');
  const hairStyleSelect = document.getElementById('hair-style');
  const outfitColorSelect = document.getElementById('outfit-color');
  const hatTypeSelect = document.getElementById('hat-type');
  const capeCheckbox = document.getElementById('has-cape');

  skinInput?.addEventListener('change', (e) => {
    game.updateCustomization('skinColor', e.target.value);
  });

  hairColorInput?.addEventListener('change', (e) => {
    game.updateCustomization('hairColor', e.target.value);
  });

  hairStyleSelect?.addEventListener('change', (e) => {
    game.updateCustomization('hairStyle', e.target.value);
  });

  outfitColorSelect?.addEventListener('change', (e) => {
    game.updateCustomization('outfitColor', e.target.value);
  });

  hatTypeSelect?.addEventListener('change', (e) => {
    game.updateCustomization('hat', e.target.value);
  });

  capeCheckbox?.addEventListener('change', (e) => {
    game.updateCustomization('hasCape', e.target.checked);
  });

  document.getElementById('btn-reset')?.addEventListener('click', () => {
    const defaults = game.resetCustomization();
    if (skinInput) skinInput.value = defaults.skinColor;
    if (hairColorInput) hairColorInput.value = defaults.hairColor;
    if (hairStyleSelect) hairStyleSelect.value = defaults.hairStyle;
    if (outfitColorSelect) outfitColorSelect.value = defaults.outfitColor;
    if (hatTypeSelect) hatTypeSelect.value = defaults.hat;
    if (capeCheckbox) capeCheckbox.checked = defaults.hasCape;
  });

  // 3. Audio settings toggle
  const soundToggleBtn = document.getElementById('sound-toggle');
  let soundEnabled = true;

  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      gameAudio.toggle(soundEnabled);

      if (soundEnabled) {
        soundToggleBtn.classList.remove('sound-muted');
        soundToggleBtn.innerHTML = '<span class="sound-icon" aria-hidden="true">🔊</span><span class="btn-label"> Sound</span>';
        soundToggleBtn.setAttribute('aria-pressed', 'true');
      } else {
        soundToggleBtn.classList.add('sound-muted');
        soundToggleBtn.innerHTML = '<span class="sound-icon" aria-hidden="true">🔇</span><span class="btn-label"> Muted</span>';
        soundToggleBtn.setAttribute('aria-pressed', 'false');
      }
      canvas?.focus();
    });
  }

  // Hook extra reset buttons
  document.getElementById('btn-reset-top')?.addEventListener('click', () => {
    game.resetLevel();
    canvas?.focus();
  });

  document.getElementById('btn-victory-restart')?.addEventListener('click', () => {
    game.resetLevel();
    canvas?.focus();
  });

  // 4. Initialize browser AudioContext on first user interaction
  const startAudioContext = () => {
    gameAudio.init();
    if (gameAudio.ctx && gameAudio.ctx.state === 'suspended') {
      gameAudio.ctx.resume().catch(() => {});
    }
    window.removeEventListener('click', startAudioContext);
    window.removeEventListener('keydown', startAudioContext);
    window.removeEventListener('touchstart', startAudioContext);
  };

  window.addEventListener('click', startAudioContext);
  window.addEventListener('keydown', startAudioContext);
  window.addEventListener('touchstart', startAudioContext, { passive: true });
});
