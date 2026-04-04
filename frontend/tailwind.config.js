export default {
  content: ['./index.html','./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        bebas: ['"Bebas Neue"','cursive'],
        dm: ['"DM Sans"','sans-serif'],
        mono: ['"JetBrains Mono"','monospace'],
      },
      colors: {
        bg:'#07070e', surface:'#0e0e1a', card:'#13131f', card2:'#1a1a2a',
        gold:'#F2A623', 'gold-dim':'#BA7517', crimson:'#D85A30', emerald:'#4CAF7D',
        muted:'#7A7870',
      },
    },
  },
  plugins:[],
}
