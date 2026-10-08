/* @refresh reload */
import { render } from 'solid-js/web'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'

// Do not call the returned update function while documents are only in memory.
// Waiting updates activate once all app windows are closed.
registerSW({ immediate: true })

const root = document.getElementById('root')

render(() => <App />, root!)
