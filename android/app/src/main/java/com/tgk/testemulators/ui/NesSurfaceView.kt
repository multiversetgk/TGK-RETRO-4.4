package com.tgk.testemulators.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.view.SurfaceHolder
import android.view.SurfaceView
import com.tgk.testemulators.core.IEmulatorCore
import com.tgk.testemulators.settings.CrtDisplayMode
import com.tgk.testemulators.settings.ScreenAspectRatio
import com.tgk.testemulators.settings.VideoFilterMode
import kotlin.math.min

/**
 * Pure native Android SurfaceView supporting Video Filters (Pixel Crisp, Smooth Linear,
 * Warm Phosphor, Mono Pocket) and CRT Scanline / PVM Border modes with zero WebView overhead.
 */
class NesSurfaceView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {

    private val frameBitmap: Bitmap = Bitmap.createBitmap(
        IEmulatorCore.VIDEO_WIDTH,
        IEmulatorCore.VIDEO_HEIGHT,
        Bitmap.Config.ARGB_8888
    )

    private val srcRect = Rect(0, 0, IEmulatorCore.VIDEO_WIDTH, IEmulatorCore.VIDEO_HEIGHT)
    private val dstRect = Rect()
    private val bezelRect = RectF()

    private val pixelPaint = Paint().apply {
        isFilterBitmap = false
        isAntiAlias = false
        isDither = false
    }

    private val scanlinePaint = Paint().apply {
        color = Color.argb(66, 0, 0, 0)
        strokeWidth = 2f
    }

    private val bezelStrokePaint = Paint().apply {
        color = Color.parseColor("#2E3342")
        style = Paint.Style.STROKE
        strokeWidth = 6f
        isAntiAlias = true
    }

    private val placeholderPaint = Paint().apply {
        color = Color.parseColor("#9C978E")
        textSize = 36f
        textAlign = Paint.Align.CENTER
        isAntiAlias = true
    }

    @Volatile
    private var surfaceReady = false

    @Volatile
    private var crtMode: CrtDisplayMode = CrtDisplayMode.PVM_BORDER

    @Volatile
    private var videoFilter: VideoFilterMode = VideoFilterMode.WARM_PHOSPHOR

    @Volatile
    private var aspectRatio: ScreenAspectRatio = ScreenAspectRatio.ORIGINAL_4_3

    init {
        holder.addCallback(this)
        isFocusable = true
        isFocusableInTouchMode = true
        applyDisplaySettings(videoFilter, crtMode, aspectRatio)
    }

    fun applyDisplaySettings(
        filter: VideoFilterMode,
        crt: CrtDisplayMode,
        aspect: ScreenAspectRatio = aspectRatio
    ) {
        videoFilter = filter
        crtMode = crt
        aspectRatio = aspect
        if (width > 0 && height > 0) {
            updateDestinationRect(width, height)
        }

        pixelPaint.isFilterBitmap = (filter == VideoFilterMode.SMOOTH_LINEAR)
        pixelPaint.colorFilter = when (filter) {
            VideoFilterMode.WARM_PHOSPHOR -> ColorMatrixColorFilter(
                ColorMatrix(
                    floatArrayOf(
                        1.08f, 0f, 0f, 0f, 4f,
                        0f, 1.04f, 0f, 0f, 2f,
                        0f, 0f, 0.95f, 0f, 0f,
                        0f, 0f, 0f, 1f, 0f
                    )
                )
            )
            VideoFilterMode.MONO_POCKET -> {
                val cm = ColorMatrix().apply { setSaturation(0f) }
                val tint = ColorMatrix(
                    floatArrayOf(
                        0.82f, 0f, 0f, 0f, 8f,
                        0f, 0.95f, 0f, 0f, 14f,
                        0f, 0f, 0.65f, 0f, 4f,
                        0f, 0f, 0f, 1f, 0f
                    )
                )
                cm.postConcat(tint)
                ColorMatrixColorFilter(cm)
            }
            else -> null
        }
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        surfaceReady = true
        updateDestinationRect(width, height)
        drawIdleScreen()
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        updateDestinationRect(width, height)
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        surfaceReady = false
    }

    fun renderFrame(argbPixels: IntArray) {
        if (!surfaceReady || argbPixels.size < IEmulatorCore.VIDEO_PIXEL_COUNT) return
        frameBitmap.setPixels(
            argbPixels,
            0,
            IEmulatorCore.VIDEO_WIDTH,
            0,
            0,
            IEmulatorCore.VIDEO_WIDTH,
            IEmulatorCore.VIDEO_HEIGHT
        )

        val canvas = holder.lockCanvas() ?: return
        try {
            canvas.drawColor(Color.parseColor("#0C0E12"))
            canvas.drawBitmap(frameBitmap, srcRect, dstRect, pixelPaint)

            if (crtMode == CrtDisplayMode.SCANLINES || crtMode == CrtDisplayMode.PVM_BORDER) {
                var y = dstRect.top.toFloat()
                val step = 6f
                while (y < dstRect.bottom) {
                    canvas.drawLine(dstRect.left.toFloat(), y, dstRect.right.toFloat(), y, scanlinePaint)
                    y += step
                }
            }

            if (crtMode == CrtDisplayMode.PVM_BORDER) {
                bezelRect.set(
                    dstRect.left - 6f,
                    dstRect.top - 6f,
                    dstRect.right + 6f,
                    dstRect.bottom + 6f
                )
                canvas.drawRoundRect(bezelRect, 14f, 14f, bezelStrokePaint)
            }
        } finally {
            holder.unlockCanvasAndPost(canvas)
        }
    }

    fun drawIdleScreen() {
        if (!surfaceReady) return
        val canvas = holder.lockCanvas() ?: return
        try {
            canvas.drawColor(Color.parseColor("#0E1014"))
            val cx = width / 2f
            val cy = height / 2f
            canvas.drawText("TGK RETRO 4.4", cx, cy - 22f, placeholderPaint)
            canvas.drawText("FCEUmm NES Console · Tap Choose .nes Game", cx, cy + 30f, placeholderPaint)
        } finally {
            holder.unlockCanvasAndPost(canvas)
        }
    }

    private fun updateDestinationRect(viewW: Int, viewH: Int) {
        if (viewW <= 0 || viewH <= 0) return
        if (aspectRatio == ScreenAspectRatio.FULL_STRETCH) {
            dstRect.set(0, 0, viewW, viewH)
            return
        }

        val pad = if (aspectRatio == ScreenAspectRatio.ORIGINAL_4_3) 14 else 0
        val availW = (viewW - pad * 2).coerceAtLeast(1)
        val availH = (viewH - pad * 2).coerceAtLeast(1)
        val isPortrait = viewH > viewW
        val targetAspect = if (aspectRatio == ScreenAspectRatio.FIT_SCREEN) {
            if (isPortrait) 4f / 3f else 16f / 10f
        } else {
            4f / 3f
        }
        val viewAspect = availW.toFloat() / availH.toFloat()
        val drawW: Int
        val drawH: Int
        if (viewAspect > targetAspect) {
            drawH = availH
            drawW = min(availW, (availH * targetAspect).toInt())
        } else {
            drawW = availW
            drawH = min(availH, (availW / targetAspect).toInt())
        }
        val left = (viewW - drawW) / 2
        val top = (viewH - drawH) / 2
        dstRect.set(left, top, left + drawW, top + drawH)
    }
}
