package com.fileos.workspace

import android.net.Uri
import android.provider.DocumentsContract
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

/** Read-only SAF access. No content is sent to the network or written to logs. */
class StorageTreeModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newFixedThreadPool(2)
  override fun getName() = "FileOSStorageTree"
  override fun invalidate() { executor.shutdown(); super.invalidate() }

  private fun checkedTree(tree: String, target: String): Pair<Uri, Uri> {
    val treeUri = Uri.parse(tree)
    val targetUri = Uri.parse(target)
    require(treeUri.scheme == "content" && DocumentsContract.isTreeUri(treeUri)) { "A granted directory is required." }
    require(targetUri.scheme == "content" && targetUri.authority == treeUri.authority && DocumentsContract.getTreeDocumentId(targetUri) == DocumentsContract.getTreeDocumentId(treeUri)) { "This document is outside the selected directory." }
    return treeUri to targetUri
  }

  @ReactMethod
  fun list(tree: String, parent: String, promise: Promise) {
    executor.execute {
      try {
        val (treeUri, parentUri) = checkedTree(tree, parent)
        val parentId = if (parentUri == treeUri) DocumentsContract.getTreeDocumentId(treeUri) else DocumentsContract.getDocumentId(parentUri)
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentId)
        val projection = arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE, DocumentsContract.Document.COLUMN_LAST_MODIFIED)
        val rows = Arguments.createArray()
        val cursor = context.contentResolver.query(childrenUri, projection, null, null, null) ?: throw IllegalStateException("The provider did not return a directory listing.")
        cursor.use {
          val idIndex = it.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
          val nameIndex = it.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
          val mimeIndex = it.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
          val sizeIndex = it.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
          val dateIndex = it.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
          while (it.moveToNext()) {
            val id = it.getString(idIndex) ?: continue
            val name = it.getString(nameIndex)
            val displayName = if (name.isNullOrEmpty()) "(Unnamed document)" else name
            val mime = it.getString(mimeIndex) ?: "application/octet-stream"
            val row = Arguments.createMap()
            row.putString("uri", DocumentsContract.buildDocumentUriUsingTree(treeUri, id).toString())
            row.putString("name", displayName)
            row.putBoolean("hasName", !name.isNullOrEmpty())
            row.putBoolean("isDirectory", mime == DocumentsContract.Document.MIME_TYPE_DIR)
            row.putDouble("size", if (sizeIndex >= 0 && !it.isNull(sizeIndex)) it.getLong(sizeIndex).toDouble() else -1.0)
            if (dateIndex >= 0 && !it.isNull(dateIndex)) row.putDouble("modified", it.getLong(dateIndex).toDouble() / 1000.0)
            rows.pushMap(row)
          }
        }
        promise.resolve(rows)
      } catch (error: Exception) { promise.reject("SAF_LIST_FAILED", error.message ?: "Unable to read folder.", error) }
    }
  }

  @ReactMethod
  fun readText(tree: String, document: String, promise: Promise) {
    executor.execute {
      try {
        val (_, uri) = checkedTree(tree, document)
        val stream = context.contentResolver.openInputStream(uri) ?: throw IllegalStateException("Unable to open document.")
        val output = ByteArrayOutputStream()
        stream.use { input ->
          val buffer = ByteArray(8192)
          var total = 0
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            if (total > 1024 * 1024) throw IllegalArgumentException("Text preview is limited to 1 MB.")
            output.write(buffer, 0, count)
          }
        }
        val decoder = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
        promise.resolve(decoder.decode(ByteBuffer.wrap(output.toByteArray())).toString())
      } catch (error: Exception) { promise.reject("SAF_READ_FAILED", error.message ?: "Unable to preview file.", error) }
    }
  }
}
