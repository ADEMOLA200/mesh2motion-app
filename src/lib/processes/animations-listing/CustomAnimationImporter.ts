import { UI } from '../../UI.ts'
import { ModalDialog } from '../../ModalDialog.ts'
import { type SkinnedMesh } from 'three'
import { type AnimationLoader, NoAnimationsError, IncompatibleSkeletonError, LoadError } from './AnimationLoader.ts'
import { type TransformedAnimationClipPair } from './interfaces/TransformedAnimationClipPair.ts'

/**
 * Handles the importing of custom animations from GLB files.
 * This class encapsulates the UI and logic for the import process.
 */
export class CustomAnimationImporter extends EventTarget {
  private readonly ui: UI
  private readonly animation_loader: AnimationLoader
  private skinned_meshes_to_animate: SkinnedMesh[]
  private skeleton_scale: number
  private enabled: boolean = true

  constructor (
    animation_loader: AnimationLoader,
    skinned_meshes_to_animate: SkinnedMesh[],
    skeleton_scale: number
  ) {
    super()
    this.ui = UI.getInstance()
    this.animation_loader = animation_loader
    this.skinned_meshes_to_animate = skinned_meshes_to_animate
    this.skeleton_scale = skeleton_scale
  }

  public set_import_context (skinned_meshes_to_animate: SkinnedMesh[], skeleton_scale: number): void {
    this.skinned_meshes_to_animate = skinned_meshes_to_animate
    this.skeleton_scale = skeleton_scale
  }

  public set_enabled (enabled: boolean): void {
    this.enabled = enabled
    if (this.ui.dom_import_animations_button != null) {
      this.ui.dom_import_animations_button.disabled = !enabled
    }
  }

  public is_enabled (): boolean {
    return this.enabled
  }

  public add_event_listeners (): void {
    this.ui.dom_import_animations_button?.addEventListener('click', () => {
      if (!this.is_enabled()) {
        return
      }
      this.ui.dom_import_animations_input?.click()
    })

    this.ui.dom_import_animations_input?.addEventListener('change', (event) => {
      void this.handle_import_animations_input_change(event)
    })
  }

  private async handle_import_animations_input_change (event: Event): Promise<void> {
    if (!this.is_enabled()) {
      return
    }
    const input = event.target as HTMLInputElement
    const files = input.files
    if (files === null || files.length === 0) {
      return
    }

    this.set_enabled(false)

    try {
      for (const file of Array.from(files)) {
        const file_name = file.name.toLowerCase()
        if (!file_name.endsWith('.glb')) {
          new ModalDialog('Unsupported file type. Please select a GLB file.', 'Error').show()
          continue
        }
        await this.import_animation_glb(file)
      }
    } finally {
      input.value = ''
      this.set_enabled(true)
    }
  }

  private async import_animation_glb (file: File): Promise<{ success: boolean, clipCount: number }> {
    try {
      const new_animation_clips = await this.animation_loader.load_animations_from_file(
        file,
        this.skinned_meshes_to_animate,
        this.skeleton_scale
      )

      this.dispatchEvent(new CustomEvent<TransformedAnimationClipPair[]>('import-success', {
        detail: new_animation_clips
      }))

      const animation_count = new_animation_clips.length
      const animation_word = animation_count === 1 ? 'animation' : 'animations'
      new ModalDialog(
        'Import Success',
        `${animation_count} ${animation_word} Imported successfully`
      ).show()

      return { success: true, clipCount: new_animation_clips.length }
    } catch (error) {
      console.error('Failed to import animations:', error)

      if (error instanceof NoAnimationsError) {
        new ModalDialog('Import Error', 'No animations found in that glb file').show()
        return { success: false, clipCount: 0 }
      }

      if (error instanceof IncompatibleSkeletonError) {
        const error_message = error.message === 'bone_count_mismatch'
          ? 'Bone count mismatch'
          : 'Bone names don\'t match'
        new ModalDialog('Import Error', error_message).show()
        return { success: false, clipCount: 0 }
      }

      if (error instanceof LoadError) {
        new ModalDialog('Import Error', 'failed to load the animation file').show()
        return { success: false, clipCount: 0 }
      }

      // Unknown error
      new ModalDialog('Import Error', 'failed to import animations from the glb file').show()
      return { success: false, clipCount: 0 }
    }
  }
}
