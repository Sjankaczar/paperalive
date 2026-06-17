/**
 * @file main.js
 * @description Entry point for PaperAlive application.
 * Mounts App into #app container.
 *
 * @see architecture/module_design.md — main.js
 */

import './style.css'
import { App } from './App.js'

const container = document.getElementById('app')
if (container) {
  const app = new App(container)
  app.init()
}
