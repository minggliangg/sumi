import { Show } from 'solid-js'
import type { Cursor } from './Editor.tsx'

export default function StatusBar(props: { cursor: Cursor }) {
  return (
    <div class="status" aria-live="off">
      <Show when={props.cursor.selected > 0}>
        <span>{props.cursor.selected} selected</span>
      </Show>
      <span>
        Ln {props.cursor.line}, Col {props.cursor.col}
      </span>
    </div>
  )
}
