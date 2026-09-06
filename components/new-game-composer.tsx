"use client"

import { useState, useTransition } from "react"

import { ChatComposer } from "@/components/chat-composer"
import { createGame } from "@/lib/games/actions"

export function NewGameComposer() {
  const [prompt, setPrompt] = useState("")
  const [isPending, startTransition] = useTransition()

  return (
    <ChatComposer
      value={prompt}
      onValueChange={setPrompt}
      disabled={isPending}
      onSubmit={() => {
        startTransition(async () => {
          await createGame(prompt)
          setPrompt("")
        })
      }}
    />
  )
}
