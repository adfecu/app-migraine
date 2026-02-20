const tintColorLight = '#2f95dc';
const tintColorDark = '#2f95dc'; // Use same accent as light - white was invisible on button with white text

export default {
  light: {
    text: '#000',
    background: '#fff',
    tint: tintColorLight,
    tabIconDefault: '#888',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: tintColorDark,
    tabIconDefault: '#999',
    tabIconSelected: tintColorDark,
  },
};
