import { create } from 'zustand'
export const useStore = create((set) => ({
  user: null, profile: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  activeUsers: 0,
  setActiveUsers: (activeUsers) => set({ activeUsers }),
  room: null, teams: [],
  setRoom: (room) => set({ room }),
  setTeams: (teams) => set({ teams }),
  updateTeam: (id, data) => set(s => ({ teams: s.teams.map(t => t.id===id?{...t,...data}:t) })),
}))
