package com.tgk.testemulators.creator

import android.content.Context
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject

data class MyChannelConfig(
    val channelName: String = "TGK Retro Gaming",
    val handle: String = "@TGKTestEmulators",
    val channelUrl: String = "https://www.youtube.com/@TGKTestEmulators",
    val tagline: String = "Classic 8-bit NES runs, Dual-Screen 1P VS Races, and FCEUmm highlights."
)

data class CreatorVideoCard(
    val id: String,
    val title: String,
    val videoUrl: String,
    val duration: String
)

data class RetroYouTuberEntry(
    val id: String,
    val name: String,
    val handle: String,
    val channelUrl: String,
    val specialty: String
)

/**
 * Pure native Android SharedPreferences store for the YouTube Creator Hub.
 * Strictly validates https:// YouTube URLs before launching Android Intent.ACTION_VIEW
 * (zero WebView usage anywhere in the app).
 */
class CreatorHubRepository(context: Context) {

    private val prefs = context.getSharedPreferences("tgk_creator_hub_v1", Context.MODE_PRIVATE)

    fun sanitizeYouTubeUrl(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return null
        val lower = trimmed.lowercase()
        if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("file:")) {
            return null
        }
        val withScheme = if (lower.startsWith("http://") || lower.startsWith("https://")) {
            trimmed
        } else {
            "https://$trimmed"
        }
        val uri = runCatching { Uri.parse(withScheme) }.getOrNull() ?: return null
        val host = uri.host?.lowercase() ?: return null
        val allowed = host == "youtube.com" ||
            host == "www.youtube.com" ||
            host == "m.youtube.com" ||
            host == "youtu.be" ||
            host == "www.youtu.be"
        if (!allowed) return null
        return uri.buildUpon().scheme("https").build().toString()
    }

    fun getMyChannel(): MyChannelConfig {
        return MyChannelConfig(
            channelName = prefs.getString(KEY_MY_NAME, null) ?: "TGK Retro Gaming",
            handle = prefs.getString(KEY_MY_HANDLE, null) ?: "@TGKTestEmulators",
            channelUrl = prefs.getString(KEY_MY_URL, null) ?: "https://www.youtube.com/@TGKTestEmulators",
            tagline = prefs.getString(KEY_MY_TAGLINE, null)
                ?: "Classic 8-bit NES runs, Dual-Screen 1P VS Races, and FCEUmm highlights."
        )
    }

    fun saveMyChannel(name: String, handle: String, url: String): Boolean {
        val safeUrl = sanitizeYouTubeUrl(url) ?: return false
        val cleanName = name.trim().take(60).ifEmpty { return false }
        val cleanHandle = handle.trim().take(40).let {
            if (it.isEmpty()) "@TGKChannel" else if (it.startsWith("@")) it else "@$it"
        }
        prefs.edit()
            .putString(KEY_MY_NAME, cleanName)
            .putString(KEY_MY_HANDLE, cleanHandle)
            .putString(KEY_MY_URL, safeUrl)
            .apply()
        return true
    }

    fun listMyVideos(): List<CreatorVideoCard> {
        val raw = prefs.getString(KEY_MY_VIDEOS, null) ?: return defaultVideos()
        return runCatching {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    val safeUrl = sanitizeYouTubeUrl(obj.optString("videoUrl")) ?: continue
                    add(
                        CreatorVideoCard(
                            id = obj.optString("id"),
                            title = obj.optString("title"),
                            videoUrl = safeUrl,
                            duration = obj.optString("duration", "10:00")
                        )
                    )
                }
            }
        }.getOrDefault(defaultVideos())
    }

    fun addMyVideo(title: String, videoUrl: String, duration: String = "10:00"): Boolean {
        val safeUrl = sanitizeYouTubeUrl(videoUrl) ?: return false
        val cleanTitle = title.trim().take(100).ifEmpty { return false }
        val updated = listMyVideos().toMutableList()
        updated.add(
            0,
            CreatorVideoCard(
                id = "vid_${System.currentTimeMillis()}",
                title = cleanTitle,
                videoUrl = safeUrl,
                duration = duration.trim().take(12).ifEmpty { "10:00" }
            )
        )
        persistVideos(updated)
        return true
    }

    fun listRetroYouTubers(): List<RetroYouTuberEntry> {
        val raw = prefs.getString(KEY_RETRO_LIST, null) ?: return defaultRetroYouTubers()
        return runCatching {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    val safeUrl = sanitizeYouTubeUrl(obj.optString("channelUrl")) ?: continue
                    add(
                        RetroYouTuberEntry(
                            id = obj.optString("id"),
                            name = obj.optString("name"),
                            handle = obj.optString("handle"),
                            channelUrl = safeUrl,
                            specialty = obj.optString("specialty", "Retro Gaming")
                        )
                    )
                }
            }
        }.getOrDefault(defaultRetroYouTubers())
    }

    fun addRetroYouTuber(name: String, handle: String, channelUrl: String, specialty: String): Boolean {
        val safeUrl = sanitizeYouTubeUrl(channelUrl) ?: return false
        val cleanName = name.trim().take(60).ifEmpty { return false }
        val cleanHandle = handle.trim().take(40).let {
            if (it.isEmpty()) "@RetroCreator" else if (it.startsWith("@")) it else "@$it"
        }
        val updated = listRetroYouTubers().toMutableList()
        updated.add(
            0,
            RetroYouTuberEntry(
                id = "creator_${System.currentTimeMillis()}",
                name = cleanName,
                handle = cleanHandle,
                channelUrl = safeUrl,
                specialty = specialty.trim().take(60).ifEmpty { "Retro Gaming" }
            )
        )
        persistRetroList(updated)
        return true
    }

    private fun persistVideos(items: List<CreatorVideoCard>) {
        val arr = JSONArray()
        for (v in items) {
            arr.put(
                JSONObject().apply {
                    put("id", v.id)
                    put("title", v.title)
                    put("videoUrl", v.videoUrl)
                    put("duration", v.duration)
                }
            )
        }
        prefs.edit().putString(KEY_MY_VIDEOS, arr.toString()).apply()
    }

    private fun persistRetroList(items: List<RetroYouTuberEntry>) {
        val arr = JSONArray()
        for (c in items) {
            arr.put(
                JSONObject().apply {
                    put("id", c.id)
                    put("name", c.name)
                    put("handle", c.handle)
                    put("channelUrl", c.channelUrl)
                    put("specialty", c.specialty)
                }
            )
        }
        prefs.edit().putString(KEY_RETRO_LIST, arr.toString()).apply()
    }

    private fun defaultVideos(): List<CreatorVideoCard> = listOf(
        CreatorVideoCard(
            id = "vid_1",
            title = "Super Mario Bros. Dual-Screen 1P VS Race — Chaos Mode",
            videoUrl = "https://www.youtube.com/@TGKTestEmulators/videos",
            duration = "12:48"
        ),
        CreatorVideoCard(
            id = "vid_2",
            title = "TGK TEST EMULATORS — Native Android FCEUmm 60FPS Setup",
            videoUrl = "https://www.youtube.com/@TGKTestEmulators/videos",
            duration = "08:15"
        )
    )

    private fun defaultRetroYouTubers(): List<RetroYouTuberEntry> = listOf(
        RetroYouTuberEntry("c1", "Cinemassacre (AVGN)", "@JamesNintendoNerd", "https://www.youtube.com/@JamesNintendoNerd", "Classic NES Reviews"),
        RetroYouTuberEntry("c2", "My Life in Gaming", "@MyLifeInGaming", "https://www.youtube.com/@MyLifeInGaming", "CRT & RGB Video Accuracy"),
        RetroYouTuberEntry("c3", "Retro Game Corps", "@RetroGameCorps", "https://www.youtube.com/@RetroGameCorps", "Android & Handheld Emulation"),
        RetroYouTuberEntry("c4", "Summoning Salt", "@SummoningSalt", "https://www.youtube.com/@SummoningSalt", "NES World Record Speedruns"),
        RetroYouTuberEntry("c5", "Gaming Historian", "@GamingHistorian", "https://www.youtube.com/@GamingHistorian", "Nintendo & 90s History"),
        RetroYouTuberEntry("c6", "Modern Vintage Gamer", "@ModernVintageGamer", "https://www.youtube.com/@ModernVintageGamer", "Emulators & Homebrew")
    )

    companion object {
        private const val KEY_MY_NAME = "my_channel_name"
        private const val KEY_MY_HANDLE = "my_channel_handle"
        private const val KEY_MY_URL = "my_channel_url"
        private const val KEY_MY_TAGLINE = "my_channel_tagline"
        private const val KEY_MY_VIDEOS = "my_videos_json"
        private const val KEY_RETRO_LIST = "retro_youtubers_json"
    }
}
