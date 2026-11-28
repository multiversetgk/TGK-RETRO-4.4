package com.tgk.testemulators.library

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import org.json.JSONArray
import org.json.JSONObject

/** One cartridge the user can launch from the Game Library. */
data class LibraryGame(
    val uri: String,
    val name: String,
    val sizeBytes: Long,
    val lastPlayedAt: Long
) {
    /** "Super_Mario_Bros.nes" -> "Super Mario Bros" (same cleaning the usage reports use). */
    val title: String
        get() = name.substringBeforeLast('.', name).replace('_', ' ').trim().ifEmpty { name }
}

/**
 * Persistent Game Library: remembers picked .nes/.zip files and a scanned ROM folder by URI so games
 * can be launched with one tap. Storage-access-framework only (no broad storage permission needed).
 */
class GameLibraryStore(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("tgk_game_library", Context.MODE_PRIVATE)

    fun games(): List<LibraryGame> {
        val raw = prefs.getString("games_json", null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                LibraryGame(
                    uri = o.getString("uri"),
                    name = o.getString("name"),
                    sizeBytes = o.optLong("size", 0L),
                    lastPlayedAt = o.optLong("played", 0L)
                )
            }
        }.getOrDefault(emptyList())
    }

    /** Games sorted A-Z for the grid. */
    fun gamesSorted(): List<LibraryGame> = games().sortedBy { it.title.lowercase() }

    /** Games that have been played, most recent first. */
    fun recent(limit: Int = 3): List<LibraryGame> =
        games().filter { it.lastPlayedAt > 0L }.sortedByDescending { it.lastPlayedAt }.take(limit)

    fun folderUri(): String? = prefs.getString("folder_uri", null)

    private fun save(list: List<LibraryGame>) {
        val arr = JSONArray()
        list.forEach {
            arr.put(
                JSONObject()
                    .put("uri", it.uri).put("name", it.name)
                    .put("size", it.sizeBytes).put("played", it.lastPlayedAt)
            )
        }
        prefs.edit().putString("games_json", arr.toString()).apply()
    }

    /** Adds a single picked file (keeps existing play history if it is already known). */
    fun addGame(uri: Uri, name: String, sizeBytes: Long): LibraryGame {
        val list = games().toMutableList()
        val existing = list.firstOrNull { it.uri == uri.toString() }
        if (existing != null) return existing
        val game = LibraryGame(uri.toString(), name, sizeBytes, 0L)
        list.add(game)
        save(list)
        return game
    }

    fun markPlayed(uriString: String) {
        val now = System.currentTimeMillis()
        save(games().map { if (it.uri == uriString) it.copy(lastPlayedAt = now) else it })
    }

    fun remove(uriString: String) {
        save(games().filterNot { it.uri == uriString })
    }

    /**
     * Scans a user-chosen folder tree (SAF) for .nes / .zip files, merges them into the library
     * (keeping play history) and remembers the folder. Returns the number of new games found.
     */
    fun scanFolder(treeUri: Uri): Int {
        runCatching {
            appContext.contentResolver.takePersistableUriPermission(
                treeUri, Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
        }
        val found = ArrayList<LibraryGame>()
        val rootId = DocumentsContract.getTreeDocumentId(treeUri)
        walk(treeUri, rootId, 0, found)

        val known = games().associateBy { it.uri }
        val merged = LinkedHashMap<String, LibraryGame>()
        known.values.forEach { merged[it.uri] = it }
        var added = 0
        found.forEach { g ->
            if (!merged.containsKey(g.uri)) added++
            merged[g.uri] = known[g.uri] ?: g
        }
        save(merged.values.toList())
        prefs.edit().putString("folder_uri", treeUri.toString()).apply()
        return added
    }

    /** Re-scans the remembered folder (if any). Returns new games found or -1 when no folder is set. */
    fun rescanSavedFolder(): Int {
        val saved = folderUri() ?: return -1
        return runCatching { scanFolder(Uri.parse(saved)) }.getOrDefault(-1)
    }

    private fun walk(treeUri: Uri, parentId: String, depth: Int, out: MutableList<LibraryGame>) {
        if (depth > MAX_DEPTH || out.size >= MAX_GAMES) return
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE
        )
        val cursor = runCatching {
            appContext.contentResolver.query(children, projection, null, null, null)
        }.getOrNull() ?: return
        cursor.use {
            while (it.moveToNext() && out.size < MAX_GAMES) {
                val id = it.getString(0) ?: continue
                val name = it.getString(1) ?: continue
                val mime = it.getString(2) ?: ""
                val size = if (it.isNull(3)) 0L else it.getLong(3)
                if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                    walk(treeUri, id, depth + 1, out)
                } else {
                    val lower = name.lowercase()
                    if (lower.endsWith(".nes") || lower.endsWith(".zip")) {
                        val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, id)
                        out.add(LibraryGame(docUri.toString(), name, size, 0L))
                    }
                }
            }
        }
    }

    private companion object {
        const val MAX_DEPTH = 4
        const val MAX_GAMES = 2000
    }
}
