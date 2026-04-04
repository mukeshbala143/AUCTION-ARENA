import { io } from 'socket.io-client'
let socket = null
export const getSocket = () => {
  if (!socket) socket = io(import.meta.env.VITE_SOCKET_URL||'http://localhost:3001',{ withCredentials:true, transports:['websocket'] })
  return socket
}
export const disconnectSocket = () => { if(socket){socket.disconnect();socket=null} }
