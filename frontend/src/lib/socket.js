import { io } from 'socket.io-client'
import { API_BASE_URL } from './config'

let socket = null
export const getSocket = () => {
  if (!socket || !socket.connected) {
    if (socket) { socket.removeAllListeners(); socket.disconnect() }
    socket = io(API_BASE_URL,{ withCredentials:true, transports:['websocket'] })
  }
  return socket
}
export const disconnectSocket = () => { if(socket){socket.removeAllListeners();socket.disconnect();socket=null} }
