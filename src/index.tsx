/* @refresh reload */
import { render } from 'solid-js/web'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'

registerSW({ immediate: true })

const root = document.getElementById('root')

render(() => <App />, root!)
