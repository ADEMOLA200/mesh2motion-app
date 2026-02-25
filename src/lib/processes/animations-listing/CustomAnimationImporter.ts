import { UI } from '../../UI.ts'
import { ModalDialog } from '../../ModalDialog.ts'
import { type AnimationClip, type SkinnedMesh } from 'three'
import { type AnimationLoader } from './AnimationLoader.ts'
import { NoAnimationsError, IncompatibleSkeletonError, LoadError } from './AnimationImportErrors.ts'
import CustomAnimationValidation from './CustomAnimationValidation.ts'
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
  private import_context_provider: (() => { skinned_meshes_to_animate: SkinnedMesh[], skeleton_scale: number }) | null = null
  private enabled: boolean = true
  private has_added_event_listeners: boolean = false

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
    this.add_event_listeners()
  }

  public set_import_context (skinned_meshes_to_animate: SkinnedMesh[], skeleton_scale: number): void {
    this.skinned_meshes_to_animate = skinned_meshes_to_animate
    this.skeleton_scale = skeleton_scale
  }

  public set_import_context_provider (provider: () => { skinned_meshes_to_animate: SkinnedMesh[], skeleton_scale: number }): void {
    this.import_context_provider = provider
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

  private add_event_listeners (): void {
    if (this.has_added_event_listeners) {
      return
    }

    this.ui.dom_import_animations_button?.addEventListener('click', () => {
      if (!this.is_enabled()) {
        return
      }
      this.sync_import_context_from_provider()
      this.ui.dom_import_animations_input?.click()
    })

    this.ui.dom_import_animations_input?.addEventListener('change', (event) => {
      void this.handle_import_animations_input_change(event)
    })

    this.has_added_event_listeners = true
  }

  private async handle_import_animations_input_change (event: Event): Promise<void> {
    if (!this.is_enabled()) {
      return
    }

    this.sync_import_context_from_provider()

    // potentially allow multiple files
    const input = event.target as HTMLInputElement
    const files = input.files
    if (files === null || files.length === 0) {
      return
    }

    this.set_enabled(false) // disable to prevent double-clicks during processing

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

  private sync_import_context_from_provider (): void {
    if (this.import_context_provider === null) {
      return
    }

    const { skinned_meshes_to_animate, skeleton_scale } = this.import_context_provider()
    this.set_import_context(skinned_meshes_to_animate, skeleton_scale)
  }

  private async import_animation_glb (file: File): Promise<{ success: boolean, clipCount: number }> {
    try {
      const new_animation_clips = await this.animation_loader.load_animations_from_file(
        file,
        this.skeleton_scale
      )

      // Validate custom animations against our target skeleton
      const clips_to_validate: AnimationClip[] = new_animation_clips.map((clip_pair) => clip_pair.display_animation_clip)
      CustomAnimationValidation.validate_animation_bones_match(clips_to_validate, this.skinned_meshes_to_animate)

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
      return this.handle_import_error(error)
    }
  }

  private handle_import_error (error: unknown): { success: boolean, clipCount: number } {
    console.error('Failed to import animations:', error)

    if (error instanceof NoAnimationsError) {
      new ModalDialog('Import Error', 'No animations found in that glb file').show()
      return { success: false, clipCount: 0 }
    }

    if (error instanceof IncompatibleSkeletonError) {
      const error_message = this.get_bone_validation_error_message(error)
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

  private get_bone_validation_error_message (error: IncompatibleSkeletonError): string {
    if (error.message === 'bone_count_mismatch' || error.message === 'bone count mismatch') {
      return 'Bone count mismatch'
    }

    return 'Bone names don\'t match'
  }

  private validate_loaded_animation_clips (new_animation_clips: TransformedAnimationClipPair[]): void {

  }
}
