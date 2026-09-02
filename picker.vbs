Set objShell = CreateObject("Shell.Application")
Set objFolder = objShell.BrowseForFolder(0, "Seleccionar Carpeta", &H0040, 0)
If TypeName(objFolder) <> "Nothing" Then
    WScript.Echo objFolder.Self.Path
End If
