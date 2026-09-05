"use client"

import { ArrowUp, ChevronDown, Grip } from "lucide-react"
import { useState, useTransition } from "react"

import { createGame } from "@/lib/games/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

export function ChatComposer() {
  const [prompt, setPrompt] = useState("")
  const [isPending, startTransition] = useTransition()

  function submit() {
    const trimmed = prompt.trim()
    if (!trimmed || isPending) return
    startTransition(async () => {
      await createGame(trimmed)
      setPrompt("")
    })
  }

  return (
    <div className="flex w-full flex-col">
      <InputGroup className="bg-popover">
        <InputGroupTextarea
          placeholder="Describe the game you want to build…"
          rows={1}
          className="field-sizing-content max-h-48 min-h-10"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          disabled={isPending}
        />
        <InputGroupAddon align="block-end">
          <DropdownMenu>
            <DropdownMenuTrigger render={<InputGroupButton />}>
              <Grip />
              Kimi K3
              <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Kimi K3</DropdownMenuItem>
              <DropdownMenuItem>Kimi K2</DropdownMenuItem>
              <DropdownMenuItem>Kimi K1.5</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="icon"
            className="ml-auto rounded-full"
            onClick={submit}
            disabled={isPending || !prompt.trim()}
          >
            <ArrowUp />
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}
