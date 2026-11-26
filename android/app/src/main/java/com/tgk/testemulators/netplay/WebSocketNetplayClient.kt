package com.tgk.testemulators.netplay

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Base64
import com.tgk.testemulators.core.NesButton
import com.tgk.testemulators.core.PlayerPort
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.min

/**
 * Native Android OkHttp WebSocket client implementing the full TGK RETRO 2.0
 * Rollback Netplay signaling & relay protocol over Wi-Fi and mobile internet.
 *
 * Includes 1.5s RTT ping sampling for adaptive input delay, exponential-backoff
 * auto-reconnect (`room:rejoin`), strict ws/wss URL validation, and consent-based
 * chunked ROM transfer framing.
 */
class WebSocketNetplayClient : INetplayClient {

    private val httpClient = OkHttpClient.Builder()
        .pingInterval(15, TimeUnit.SECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private val mainHandler = Handler(Looper.getMainLooper())
    private var webSocket: WebSocket? = null
    private var listener: NetplayListener? = null

    private var lastWsUrl: String? = null
    private var lastPlayerName: String = "Android Player"
    private var lastHandshake: PeerHandshakeInfo? = null
    private var intentionalClose: Boolean = false
    private var reconnectAttempt: Int = 0
    private var pingRunnable: Runnable? = null
    private var reconnectRunnable: Runnable? = null

    @Volatile
    override var isConnected: Boolean = false
        private set

    @Volatile
    override var localPort: PlayerPort? = null
        private set

    @Volatile
    override var roomCode: String? = null
        private set

    @Volatile
    override var roomMode: String = "shared-2p"
        private set

    override fun connectAndCreateRoom(
        wsUrl: String,
        playerName: String,
        handshake: PeerHandshakeInfo,
        listener: NetplayListener,
        mode: String,
        turnBasedSharedPort1: Boolean
    ) {
        val safeUrl = sanitizeWsUrl(wsUrl)
        if (safeUrl == null) {
            listener.onError("Invalid server URL. Use wss:// or ws:// ending in /ws/netplay.")
            return
        }
        roomMode = if (mode == "dual-race") "dual-race" else "shared-2p"
        lastWsUrl = safeUrl
        lastPlayerName = playerName.trim().take(24).ifEmpty { "Player 1" }
        lastHandshake = handshake
        intentionalClose = false
        reconnectAttempt = 0

        val payload = JSONObject().apply {
            put("type", "room:create")
            put("playerName", lastPlayerName)
            put("roomMode", roomMode)
            put("romName", handshake.romName)
            put("romHash", handshake.romHash)
            put("romSha256", handshake.romSha256)
            put("romSizeBytes", handshake.romSizeBytes)
            put("coreId", handshake.coreId)
            put("coreVersion", handshake.coreVersion)
            put("protocolVersion", NETPLAY_PROTOCOL_VERSION)
            put("turnBasedSharedPort1", turnBasedSharedPort1)
        }
        openSocket(safeUrl, payload, listener)
    }

    override fun connectAndJoinRoom(
        wsUrl: String,
        roomCode: String,
        playerName: String,
        handshake: PeerHandshakeInfo?,
        listener: NetplayListener
    ) {
        val safeUrl = sanitizeWsUrl(wsUrl)
        if (safeUrl == null) {
            listener.onError("Invalid server URL. Use wss:// or ws:// ending in /ws/netplay.")
            return
        }
        val cleanCode = roomCode.uppercase().replace(Regex("[^A-Z0-9]"), "").take(6)
        if (cleanCode.length < 4) {
            listener.onError("Enter a valid 4-6 character room code.")
            return
        }
        lastWsUrl = safeUrl
        lastPlayerName = playerName.trim().take(24).ifEmpty { "Player 2" }
        lastHandshake = handshake
        this.roomCode = cleanCode
        intentionalClose = false
        reconnectAttempt = 0

        val payload = JSONObject().apply {
            put("type", "room:join")
            put("roomCode", cleanCode)
            put("playerName", lastPlayerName)
            put("protocolVersion", NETPLAY_PROTOCOL_VERSION)
            if (handshake != null) {
                put("coreId", handshake.coreId)
                put("coreVersion", handshake.coreVersion)
                put("romName", handshake.romName)
                put("romSha256", handshake.romSha256)
            }
        }
        openSocket(safeUrl, payload, listener)
    }

    override fun sendPeerHello(meta: PeerHandshakeInfo) {
        lastHandshake = meta
        val msg = JSONObject().apply {
            put("type", "peer:hello")
            put(
                "meta",
                JSONObject().apply {
                    put("protocolVersion", meta.protocolVersion)
                    put("coreId", meta.coreId)
                    put("coreVersion", meta.coreVersion)
                    put("romName", meta.romName)
                    put("romHash", meta.romHash)
                    put("romSha256", meta.romSha256)
                    put("romSizeBytes", meta.romSizeBytes)
                    put("determinismVerified", meta.determinismVerified)
                }
            )
        }
        webSocket?.send(msg.toString())
    }

    override fun sendFrameInputs(
        port: PlayerPort,
        latestFrame: Int,
        ackFrame: Int,
        inputs: List<FrameInputEntry>
    ) {
        val arr = JSONArray()
        for (item in inputs) {
            arr.put(
                JSONObject().apply {
                    put("frame", item.frame)
                    put("mask", item.mask and 0xFF)
                }
            )
        }
        val msg = JSONObject().apply {
            put("type", "input:frame")
            put("port", port.index + 1)
            put("latestFrame", latestFrame)
            put("ackFrame", ackFrame)
            put("inputs", arr)
        }
        webSocket?.send(msg.toString())
    }

    override fun sendChecksum(frame: Int, checksum: String) {
        val msg = JSONObject().apply {
            put("type", "sync:checksum")
            put("frame", frame)
            put("checksum", checksum)
        }
        webSocket?.send(msg.toString())
    }

    override fun sendSyncPulse(pulseId: Int, frame: Int, sentAtMs: Long) {
        val msg = JSONObject().apply {
            put("type", "sync:pulse")
            put("pulseId", pulseId)
            put("frame", frame)
            put("sentAtMs", sentAtMs)
        }
        webSocket?.send(msg.toString())
    }

    override fun sendAuthoritativeSnapshot(
        frame: Int,
        stateBytes: ByteArray,
        checksum: String,
        romSha256: String,
        romHash: String,
        reason: String
    ) {
        val encoded = Base64.encodeToString(stateBytes, Base64.NO_WRAP)
        val msg = JSONObject().apply {
            put("type", "state:snapshot")
            put("frame", frame)
            put("stateJson", encoded)
            put("checksum", checksum)
            put("romSha256", romSha256)
            put("romHash", romHash)
            put("reason", reason)
        }
        webSocket?.send(msg.toString())
    }

    override fun sendSyncControl(action: String, targetFrame: Int, activeTurnPort: PlayerPort?) {
        val msg = JSONObject().apply {
            put("type", "control:sync")
            put("action", action)
            put("targetFrame", targetFrame)
            if (activeTurnPort != null) {
                put("activeTurnPort", activeTurnPort.index + 1)
            }
        }
        webSocket?.send(msg.toString())
    }

    override fun sendRomTransferOffer(offer: RomTransferOfferInfo) {
        val msg = JSONObject().apply {
            put("type", "rom:transfer_offer")
            put(
                "offer",
                JSONObject().apply {
                    put("transferId", offer.transferId)
                    put("romName", offer.romName)
                    put("sizeBytes", offer.sizeBytes)
                    put("sha256", offer.sha256)
                    put("chunkCount", offer.chunkCount)
                }
            )
        }
        webSocket?.send(msg.toString())
    }

    override fun acceptRomTransfer(transferId: String, saveToLocalStorage: Boolean) {
        val msg = JSONObject().apply {
            put("type", "rom:transfer_accept")
            put("transferId", transferId)
            put("saveToLocalStorage", saveToLocalStorage)
        }
        webSocket?.send(msg.toString())
    }

    override fun declineRomTransfer(transferId: String, reason: String) {
        val msg = JSONObject().apply {
            put("type", "rom:transfer_decline")
            put("transferId", transferId)
            put("reason", reason)
        }
        webSocket?.send(msg.toString())
    }

    override fun sendRomTransferChunk(
        transferId: String,
        chunkIndex: Int,
        chunkCount: Int,
        dataBase64: String
    ) {
        val msg = JSONObject().apply {
            put("type", "rom:transfer_chunk")
            put("transferId", transferId)
            put("chunkIndex", chunkIndex)
            put("chunkCount", chunkCount)
            put("dataBase64", dataBase64)
        }
        webSocket?.send(msg.toString())
    }

    override fun sendRomTransferComplete(
        transferId: String,
        verified: Boolean,
        sha256: String,
        error: String?
    ) {
        val msg = JSONObject().apply {
            put("type", "rom:transfer_complete")
            put("transferId", transferId)
            put("verified", verified)
            put("sha256", sha256)
            if (!error.isNullOrBlank()) put("error", error)
        }
        webSocket?.send(msg.toString())
    }

    override fun sendInput(port: PlayerPort, button: NesButton, pressed: Boolean) {
        val msg = JSONObject().apply {
            put("type", "input:event")
            put("port", port.index + 1)
            put("button", button.label)
            put("pressed", pressed)
            put("frame", 0)
        }
        webSocket?.send(msg.toString())
    }

    override fun sendStateSync(stateBytes: ByteArray) {
        val encoded = Base64.encodeToString(stateBytes, Base64.NO_WRAP)
        val msg = JSONObject().apply {
            put("type", "state:sync")
            put("stateJson", encoded)
            put("frame", 0)
            put("romHash", lastHandshake?.romHash ?: "")
        }
        webSocket?.send(msg.toString())
    }

    override fun sendControlAction(action: String) {
        val msg = JSONObject().apply {
            put("type", "control:action")
            put("action", action)
        }
        webSocket?.send(msg.toString())
    }

    override fun setLocalHold(held: Boolean, reason: String) {
        val msg = JSONObject().apply {
            put("type", "room:hold")
            put("held", held)
            put("reason", reason)
        }
        webSocket?.send(msg.toString())
    }

    override fun sendRaceTelemetry(port: PlayerPort, score: Int, coins: Int, lives: Int, stage: Int) {
        val packet = JSONObject().apply {
            put("port", port.index + 1)
            put("frame", 0)
            put("previewDataUrl", JSONObject.NULL)
            put(
                "telemetry",
                JSONObject().apply {
                    put("score", score)
                    put("coins", coins)
                    put("lives", lives)
                    put("world", 1)
                    put("stage", stage)
                    put("flagpoleCleared", false)
                    put("survivedSeconds", 0)
                    put("hasRamMapping", true)
                }
            )
        }
        val msg = JSONObject().apply {
            put("type", "race:telemetry")
            put("packet", packet)
        }
        webSocket?.send(msg.toString())
    }

    override fun disconnect() {
        intentionalClose = true
        stopTimers()
        if (isConnected) {
            runCatching { webSocket?.send(JSONObject().put("type", "room:leave").toString()) }
        }
        isConnected = false
        localPort = null
        roomCode = null
        roomMode = "shared-2p"
        webSocket?.close(1000, "Client disconnected")
        webSocket = null
    }

    private fun openSocket(wsUrl: String, initialHandshake: JSONObject, listener: NetplayListener) {
        stopTimers()
        webSocket?.close(1000, "Reconnecting")
        webSocket = null
        this.listener = listener

        val request = Request.Builder().url(wsUrl).build()
        webSocket = httpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                isConnected = true
                reconnectAttempt = 0
                ws.send(initialHandshake.toString())
                startPingLoop()
            }

            override fun onMessage(ws: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                isConnected = false
                stopPingLoop()
                if (!tryScheduleReconnect()) {
                    listener.onDisconnected(reason.ifBlank { "Closed ($code)" })
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                isConnected = false
                stopPingLoop()
                if (!tryScheduleReconnect()) {
                    listener.onDisconnected(t.message ?: "Connection failed")
                }
            }
        })
    }

    private fun tryScheduleReconnect(): Boolean {
        val url = lastWsUrl
        val code = roomCode
        val port = localPort
        val activeListener = listener
        if (intentionalClose || url == null || code.isNullOrBlank() || port == null || activeListener == null) {
            return false
        }
        if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
            return false
        }
        reconnectAttempt += 1
        val delayMs = min(8000L, 1000L shl (reconnectAttempt - 1))
        activeListener.onReconnecting(reconnectAttempt, MAX_RECONNECT_ATTEMPTS)

        reconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        val r = Runnable {
            if (intentionalClose) return@Runnable
            val rejoin = JSONObject().apply {
                put("type", "room:rejoin")
                put("roomCode", code)
                put("port", port.index + 1)
                put("playerName", lastPlayerName)
                lastHandshake?.let {
                    put("coreId", it.coreId)
                    put("coreVersion", it.coreVersion)
                    put("romSha256", it.romSha256)
                }
            }
            openSocket(url, rejoin, activeListener)
        }
        reconnectRunnable = r
        mainHandler.postDelayed(r, delayMs)
        return true
    }

    private fun startPingLoop() {
        stopPingLoop()
        val r = object : Runnable {
            override fun run() {
                if (isConnected) {
                    val ping = JSONObject().apply {
                        put("type", "ping")
                        put("sentAt", System.currentTimeMillis())
                    }
                    webSocket?.send(ping.toString())
                    mainHandler.postDelayed(this, 1500L)
                }
            }
        }
        pingRunnable = r
        mainHandler.post(r)
    }

    private fun stopPingLoop() {
        pingRunnable?.let { mainHandler.removeCallbacks(it) }
        pingRunnable = null
    }

    private fun stopTimers() {
        stopPingLoop()
        reconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        reconnectRunnable = null
    }

    private fun handleMessage(raw: String) {
        runCatching {
            val json = JSONObject(raw)
            when (json.optString("type")) {
                "room:created", "room:joined" -> {
                    val code = json.optString("roomCode")
                    val portNum = json.optInt("assignedPort", json.optInt("port", 1))
                    val mode = json.optString("roomMode", "shared-2p")
                    val assigned = if (portNum == 2) PlayerPort.PORT_2 else PlayerPort.PORT_1
                    val playersCount = json.optJSONArray("players")?.length() ?: 1
                    roomCode = code
                    roomMode = mode
                    localPort = assigned
                    listener?.onConnected(
                        RoomJoinInfo(
                            roomCode = code,
                            assignedPort = assigned,
                            roomMode = mode,
                            romName = json.optString("romName", "NES Cartridge"),
                            romSha256 = json.optString("romSha256", ""),
                            coreVersion = json.optString("coreVersion", ""),
                            turnBasedSharedPort1 = json.optBoolean("turnBasedSharedPort1", false),
                            playerCount = playersCount
                        )
                    )
                }
                "room:peer_joined" -> {
                    val count = json.optJSONArray("players")?.length() ?: 2
                    val reconnected = json.optBoolean("reconnected", false)
                    listener?.onPeerJoined(count, reconnected)
                }
                "room:peer_left" -> {
                    val port = if (json.optInt("port", 2) == 2) PlayerPort.PORT_2 else PlayerPort.PORT_1
                    val count = json.optJSONArray("players")?.length() ?: 1
                    listener?.onPeerLeft(port, count)
                }
                "room:peer_hold" -> {
                    val held = json.optBoolean("held", false)
                    val portNum = json.optInt("port", 2)
                    val port = if (portNum == 2) PlayerPort.PORT_2 else PlayerPort.PORT_1
                    val reason = json.optString("reason", "disconnect")
                    val grace = json.optInt("graceSeconds", 45)
                    listener?.onPeerHoldChanged(held, port, reason, grace)
                }
                "peer:hello" -> {
                    val port = if (json.optInt("port", 2) == 2) PlayerPort.PORT_2 else PlayerPort.PORT_1
                    val m = json.optJSONObject("meta") ?: return
                    listener?.onPeerHello(
                        port,
                        PeerHandshakeInfo(
                            protocolVersion = m.optString("protocolVersion", NETPLAY_PROTOCOL_VERSION),
                            coreId = m.optString("coreId", ""),
                            coreVersion = m.optString("coreVersion", ""),
                            romName = m.optString("romName", ""),
                            romHash = m.optString("romHash", ""),
                            romSha256 = m.optString("romSha256", ""),
                            romSizeBytes = m.optInt("romSizeBytes", 0),
                            determinismVerified = m.optBoolean("determinismVerified", false)
                        )
                    )
                }
                "input:frame" -> {
                    val port = if (json.optInt("port", 2) == 2) PlayerPort.PORT_2 else PlayerPort.PORT_1
                    val latestFrame = json.optInt("latestFrame", 0)
                    val ackFrame = json.optInt("ackFrame", 0)
                    val arr = json.optJSONArray("inputs") ?: return
                    val entries = ArrayList<FrameInputEntry>(arr.length())
                    for (i in 0 until arr.length()) {
                        val obj = arr.optJSONObject(i) ?: continue
                        entries.add(FrameInputEntry(obj.optInt("frame", 0), obj.optInt("mask", 0) and 0xFF))
                    }
                    listener?.onRemoteFrameInputs(port, latestFrame, ackFrame, entries)
                }
                "sync:checksum" -> {
                    val port = if (json.optInt("port", 2) == 2) PlayerPort.PORT_2 else PlayerPort.PORT_1
                    val frame = json.optInt("frame", 0)
                    val checksum = json.optString("checksum", "")
                    if (checksum.isNotEmpty()) {
                        listener?.onRemoteChecksum(port, frame, checksum)
                    }
                }
                "sync:pulse" -> {
                    val port = if (json.optInt("port", 2) == 2) PlayerPort.PORT_2 else PlayerPort.PORT_1
                    listener?.onSyncPulse(
                        SyncPulsePacket(
                            pulseId = json.optInt("pulseId", 0),
                            port = port,
                            frame = json.optInt("frame", 0),
                            sentAtMs = json.optLong("sentAtMs", System.currentTimeMillis())
                        )
                    )
                }
                "state:snapshot" -> {
                    val encoded = json.optString("stateJson", "")
                    if (encoded.isNotEmpty()) {
                        val bytes = Base64.decode(encoded, Base64.DEFAULT)
                        listener?.onAuthoritativeSnapshot(
                            frame = json.optInt("frame", 0),
                            stateBytes = bytes,
                            checksum = json.optString("checksum", ""),
                            romSha256 = json.optString("romSha256", ""),
                            reason = json.optString("reason", "initial")
                        )
                    }
                }
                "control:sync" -> {
                    val action = json.optString("action", "")
                    val targetFrame = json.optInt("targetFrame", 0)
                    val turnPortNum = json.optInt("activeTurnPort", 0)
                    val turnPort = when (turnPortNum) {
                        1 -> PlayerPort.PORT_1
                        2 -> PlayerPort.PORT_2
                        else -> null
                    }
                    if (action.isNotEmpty()) {
                        listener?.onSyncControl(action, targetFrame, turnPort)
                    }
                }
                "rom:transfer_offer" -> {
                    val o = json.optJSONObject("offer") ?: return
                    listener?.onRomTransferOffer(
                        RomTransferOfferInfo(
                            transferId = o.optString("transferId", ""),
                            romName = o.optString("romName", "cartridge.nes"),
                            sizeBytes = o.optInt("sizeBytes", 0),
                            sha256 = o.optString("sha256", ""),
                            chunkCount = o.optInt("chunkCount", 0)
                        )
                    )
                }
                "rom:transfer_accept" -> {
                    listener?.onRomTransferAccept(
                        json.optString("transferId", ""),
                        json.optBoolean("saveToLocalStorage", false)
                    )
                }
                "rom:transfer_decline" -> {
                    listener?.onRomTransferDecline(
                        json.optString("transferId", ""),
                        json.optString("reason", "Declined")
                    )
                }
                "rom:transfer_chunk" -> {
                    listener?.onRomTransferChunk(
                        transferId = json.optString("transferId", ""),
                        chunkIndex = json.optInt("chunkIndex", 0),
                        chunkCount = json.optInt("chunkCount", 0),
                        dataBase64 = json.optString("dataBase64", "")
                    )
                }
                "rom:transfer_complete" -> {
                    listener?.onRomTransferComplete(
                        transferId = json.optString("transferId", ""),
                        verified = json.optBoolean("verified", false),
                        sha256 = json.optString("sha256", ""),
                        error = json.optString("error").ifBlank { null }
                    )
                }
                "pong" -> {
                    val sentAt = json.optLong("sentAt", 0L)
                    if (sentAt > 0L) {
                        val rtt = (System.currentTimeMillis() - sentAt).toInt().coerceIn(1, 2000)
                        listener?.onPingSample(rtt)
                    }
                }
                "race:telemetry" -> {
                    val pkt = json.optJSONObject("packet") ?: return
                    val tel = pkt.optJSONObject("telemetry") ?: return
                    val port = if (pkt.optInt("port", 2) == 2) PlayerPort.PORT_2 else PlayerPort.PORT_1
                    listener?.onRemoteRaceTelemetry(
                        port = port,
                        score = tel.optInt("score", 0),
                        coins = tel.optInt("coins", 0),
                        lives = tel.optInt("lives", 3),
                        stage = tel.optInt("stage", 1)
                    )
                }
                "input:event" -> {
                    val port = if (json.optInt("port", 1) == 2) PlayerPort.PORT_2 else PlayerPort.PORT_1
                    val button = NesButton.fromProtocolName(json.optString("button")) ?: return
                    val pressed = json.optBoolean("pressed", false)
                    listener?.onRemoteInput(port, button, pressed)
                }
                "state:sync" -> {
                    val encoded = json.optString("stateJson", json.optString("payload", ""))
                    if (encoded.isNotEmpty()) {
                        val bytes = Base64.decode(encoded, Base64.DEFAULT)
                        listener?.onStateSyncReceived(bytes)
                    }
                }
                "control:action" -> {
                    val action = json.optString("action")
                    if (action.isNotEmpty()) {
                        listener?.onControlAction(action)
                    }
                }
                "error" -> {
                    val msg = json.optString("message", "Netplay error")
                    listener?.onError(msg)
                }
            }
        }
    }

    companion object {
        private const val MAX_RECONNECT_ATTEMPTS = 5

        fun sanitizeWsUrl(raw: String): String? {
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) return null
            val uri = runCatching { Uri.parse(trimmed) }.getOrNull() ?: return null
            val scheme = uri.scheme?.lowercase() ?: return null
            if (scheme != "ws" && scheme != "wss") return null
            if (uri.host.isNullOrBlank()) return null
            return uri.toString()
        }
    }
}
