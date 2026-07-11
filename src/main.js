import { GymnasticsGame } from './game';
import { gameAudio } from './audio';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize the game
  const game = new GymnasticsGame('game-canvas');

  // Focus canvas by default so keyboard inputs work immediately
  const canvas = document.getElementById('game-canvas');
  if (canvas) {
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
      // Re-focus canvas so keyboard inputs keep working
      canvas?.focus();
    }
  };

  document.getElementById('btn-toggle-customizer')?.addEventListener('click', () => openModal('customizer-modal'));
  document.getElementById('btn-close-customizer')?.addEventListener('click', () => closeModal('customizer-modal'));

  document.getElementById('btn-toggle-collection')?.addEventListener('click', () => openModal('collection-modal'));
  document.getElementById('btn-close-collection')?.addEventListener('click', () => closeModal('collection-modal'));

  document.getElementById('btn-toggle-help')?.addEventListener('click', () => openModal('help-modal'));
  document.getElementById('btn-close-help')?.addEventListener('click', () => closeModal('help-modal'));

  document.getElementById('btn-close-viewer')?.addEventListener('click', () => {
    closeModal('squishy-viewer-modal');
    game.viewerActive = false;
  });

  // Close modals on clicking outside the card
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      closeModal(e.target.id);
      if (e.target.id === 'squishy-viewer-modal') {
        game.viewerActive = false;
      }
    }
  });

  // 2. Character Customization updates
  document.getElementById('skin-color')?.addEventListener('change', (e) => {
    game.updateCustomization('skinColor', e.target.value);
  });

  document.getElementById('hair-color')?.addEventListener('change', (e) => {
    game.updateCustomization('hairColor', e.target.value);
  });

  document.getElementById('hair-style')?.addEventListener('change', (e) => {
    game.updateCustomization('hairStyle', e.target.value);
  });

  document.getElementById('outfit-color')?.addEventListener('change', (e) => {
    game.updateCustomization('outfitColor', e.target.value);
  });

  document.getElementById('hat-type')?.addEventListener('change', (e) => {
    game.updateCustomization('hat', e.target.value);
  });

  document.getElementById('has-cape')?.addEventListener('change', (e) => {
    game.updateCustomization('hasCape', e.target.checked);
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
        soundToggleBtn.innerHTML = '🔊 Sound';
      } else {
        soundToggleBtn.classList.add('sound-muted');
        soundToggleBtn.innerHTML = '🔇 Muted';
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

  // 4. Initialize browser AudioContext on user interaction
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
  window.addEventListener('touchstart', startAudioContext);
});
