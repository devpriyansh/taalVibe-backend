/**
 * DFS Live Contest Namespace
 *
 * Subscribes to Redis scoring_deltas pub/sub channel.
 * When ComputeLiveScores cron publishes a delta, broadcasts it
 * to all sockets in the dfs_contest:{contestId} room.
 *
 * NOTE: Currently loaded but frontend is using polling (REST API).
 *       When frontend switches to WebSocket, the client just needs to:
 *         socket.emit('dfs_join_contest', { contestId })
 *         socket.on('dfs_leaderboard_delta', handler)
 */

import redisClient from '../../libs/redisClient'
import { SOCKET_LISTENERS, SOCKET_EMITTERS } from '../../libs/constants'

const contestRoom = (contestId) => `dfs_contest:${contestId}`

let subscriberStarted = false

function startDeltaSubscriber (io) {
  redisClient.subscriberClient.subscribe('scoring_deltas', (err) => {
    if (err) {
      console.error('[DFS Socket] Failed to subscribe to scoring_deltas:', err.message)
      return
    }
    console.log('[DFS Socket] Subscribed to Redis scoring_deltas channel')
  })

  redisClient.subscriberClient.on('message', (channel, message) => {
    if (channel !== 'scoring_deltas') return

    let delta
    try {
      delta = JSON.parse(message)
    } catch {
      console.warn('[DFS Socket] Malformed delta payload:', message)
      return
    }

    const { contest_id } = delta
    if (!contest_id) return

    io.of('/').to(contestRoom(contest_id)).emit(SOCKET_EMITTERS.DFS_LEADERBOARD_DELTA, {
      contest_id,
      timestamp: delta.timestamp || new Date().toISOString(),
      player_updates: delta.changes || [],
      entry_updates: delta.affected_entries || []
    })
  })
}

/**
 * @param {import('socket.io').Server} io
 */
export default function dfsContestNamespace (io) {
  if (!subscriberStarted) {
    // startDeltaSubscriber(io) // Disabled to prevent Redis connection errors locally
    subscriberStarted = true
  }

  const namespace = io.of('/')

  namespace.on('connection', (socket) => {
    /* Client joins a live contest room */
    socket.on(SOCKET_LISTENERS.DFS_JOIN_CONTEST, async (payload) => {
      try {
        const contestId = payload?.payload?.contestId || payload?.contestId
        const userId = socket.data?.userId || payload?.payload?.userId || payload?.userId

        if (!contestId) {
          socket.emit('error', { message: 'contestId is required to join live contest' })
          return
        }

        const room = contestRoom(contestId)
        await socket.join(room)

        console.log(`[DFS Socket] User ${userId} joined room ${room}`)

        socket.emit(SOCKET_EMITTERS.DFS_CONTEST_JOINED, {
          contest_id: contestId,
          room,
          message: 'Joined live contest room — delta updates will be pushed'
        })
      } catch (err) {
        console.error('[DFS Socket] Error in DFS_JOIN_CONTEST:', err)
        socket.emit('error', { message: 'Failed to join contest room' })
      }
    })

    /* Client leaves a live contest room */
    socket.on(SOCKET_LISTENERS.DFS_LEAVE_CONTEST, async (payload) => {
      try {
        const contestId = payload?.payload?.contestId || payload?.contestId
        if (!contestId) return
        await socket.leave(contestRoom(contestId))
        console.log(`[DFS Socket] Socket ${socket.id} left room ${contestRoom(contestId)}`)
      } catch (err) {
        console.error('[DFS Socket] Error in DFS_LEAVE_CONTEST:', err)
      }
    })
  })
}
