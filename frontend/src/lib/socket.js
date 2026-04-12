import { io } from 'socket.io-client'
import { SOCKET_BASE_URL } from './config'

let socket = null
export const getSocket = () => {
  if (!socket) {
    socket = io(SOCKET_BASE_URL,{ withCredentials:true, transports:['websocket'] })
  }
  return socket
}
export const disconnectSocket = () => { if(socket){socket.removeAllListeners();socket.disconnect();socket=null} }
