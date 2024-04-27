
## Why

Why make this plug-in? 

With the in-depth use of card box notes, I think its core is: linear output requires linear input. I need a plug-in that can connect all my notes like a chain. Add a small piece of the puzzle to the world of note management.

Notes use metadata `PrevNote` and `NextNote` to define the previous notes and next notes of the current note. Through this relationship, string notes together that you think are on the same chain. 

```mermaid
graph LR

Head -.-> P[...] --> PrevA --> A --> NextA -.-> N[...] --> Tail
```

## Connect&Open

`Note Chain: Create New Note`：Create Prev/Next/Tail/Head Note relative to current note.

![image](./assets/Pasted%20image%2020240427203711.png)

`Note Chain: Open prev note`: Open prev note, recommended shortcut key `Alt+←`;

`Note Chain: Open next note`: Open next note, recommended shortcut key `Alt+→`;

`Note Chain: Open note`: Select a note from notes sorted by modify time.

`Note Chain: Open note smarter`: First select the group of notes, then select and open note.

![image](./assets/Pasted%20image%2020240427204500.png)

## Build Chain

NoteChain provides three ways to help set up note chains for multiple notes.

`NoteChai: Insert node of chain`：
1. Select the group of notes
2. Select node note
3. Select node relationship

![image](./assets/Pasted%20image%2020240427204943.png)

First two steps are same as `Open note smarter`. After select a node note, select the relation between current note to anchor. `Folder As Next` is used to set the Prev Note for the parent of current note. 

I recommend to set frontmatter of folder-note(with same name to folder)：
- `FolderPrevNote: "[[PrevNoteName]]+0.5"`

For example, you can set `FolderPrevNote` for FlolderC and FolderD to sort them in `file-explor`：
- `FolderC`：`FolderPrevNote: "[[noteB]]+0.2"`
- `FolderD`：`FolderPrevNote: "[[noteB]]+0.6"`

```mermaid
graph LR
noteA --> noteB --> FolderC --> FolderD --> noteF
```

> [!NOTE]- `Reset Note Chain by LongForm`
> 1. First, install LongForm to create a new project and sort the notes;
> ![image](./assets/Pasted%20image%2020240420113647.png)
> 2. Call the `longform` metadata note and execute the command. The preceding and following notes will be set according to the order of `scenes` + `ignored`;

`Reset the chain of current folder!`：Select mode to set prev/next note sequencely.
- `chain`: Sort by file name first, then sort by the exsited chain
- `name`: sort by file name. This is used for Daily Note.
- `ctime`: Sort by creation time
- `mtime`: Sort by modification time

`name/ctime/mtime` will reset your setting prev/next notes!

## `File-Explorer`

Now that you have completed setting up the note chain, experience the fun of browsing in the directory. Turn on the `Sort File Exploter` option in the settings page. You will find that the files in the directory have been sorted by note chains. This will invalidate existing sorting functionality.

## `Setting`

If you set `Insert node of chain:Default Mode`, when run `Insert node of chain`, NoteChain select anchor node from `Notes In Same Folder`。

![image](./assets/Pasted%20image%2020240427211326.png)


