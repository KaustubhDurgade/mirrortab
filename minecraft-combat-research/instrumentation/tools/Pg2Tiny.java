import net.fabricmc.mappingio.*;
import net.fabricmc.mappingio.adapter.MappingSourceNsSwitch;
import net.fabricmc.mappingio.format.MappingFormat;
import net.fabricmc.mappingio.tree.MemoryMappingTree;
import java.nio.file.*;
public class Pg2Tiny {
  public static void main(String[] a) throws Exception {
    MemoryMappingTree t = new MemoryMappingTree();
    MappingReader.read(Path.of(a[0]), MappingFormat.PROGUARD_FILE, new MappingSourceNsSwitch(t, "target"));
    // after switch: src=target(obf), dst=source(named)
    try (MappingWriter w = MappingWriter.create(Path.of(a[1]), MappingFormat.TINY_2_FILE)) { t.accept(w); }
    System.out.println(t.getSrcNamespace()+" -> "+t.getDstNamespaces());
  }
}
