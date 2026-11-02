package research.combatprobe;

import io.netty.channel.ChannelDuplexHandler;
import io.netty.channel.ChannelHandlerContext;
import io.papermc.paper.event.player.PrePlayerAttackEntityEvent;
import com.destroystokyo.paper.event.player.PlayerAttackEntityCooldownResetEvent;
import io.papermc.paper.event.player.PlayerShieldDisableEvent;
import com.destroystokyo.paper.event.server.ServerTickEndEvent;
import com.destroystokyo.paper.event.player.PlayerJumpEvent;
import io.papermc.paper.event.entity.EntityKnockbackEvent;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.phys.Vec3;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.craftbukkit.entity.CraftEntity;
import org.bukkit.craftbukkit.entity.CraftPlayer;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.player.*;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.*;
import java.lang.reflect.Field;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Passive instrumentation. All listeners run at MONITOR priority with ignoreCancelled=false and
 * NEVER mutate event state. Per-tick snapshots read NMS fields via getters/reflection only.
 * Inbound packet tap is a read-only Netty handler that records arrival time on the network thread.
 */
public class CombatProbe extends JavaPlugin implements Listener {
    private PrintWriter out;
    private final AtomicLong seq = new AtomicLong();
    private final ConcurrentLinkedQueue<String> netQueue = new ConcurrentLinkedQueue<>();
    private Field attackStrengthTicker, stuckSpeed, lastHurt;
    private static final Set<String> NET_OF_INTEREST = Set.of(
        "ServerboundInteractPacket", "ServerboundSetCarriedItemPacket", "ServerboundPlayerCommandPacket",
        "ServerboundPlayerInputPacket", "ServerboundClientTickEndPacket", "ServerboundUseItemPacket",
        "ServerboundPlayerActionPacket", "ServerboundSwingPacket", "ServerboundUseItemOnPacket",
        "Pos", "PosRot", "Rot", "StatusOnly");

    @Override public void onEnable() {
        try {
            Path dir = getDataFolder().toPath(); Files.createDirectories(dir);
            Path f = dir.resolve("probe-" + System.currentTimeMillis() + ".jsonl");
            out = new PrintWriter(new BufferedWriter(new FileWriter(f.toFile())), false);
            getLogger().info("logging to " + f);
            attackStrengthTicker = LivingEntity.class.getDeclaredField("attackStrengthTicker"); attackStrengthTicker.setAccessible(true);
            stuckSpeed = Entity.class.getDeclaredField("stuckSpeedMultiplier"); stuckSpeed.setAccessible(true);
            lastHurt = LivingEntity.class.getDeclaredField("lastHurt"); lastHurt.setAccessible(true);
        } catch (Exception e) { throw new RuntimeException(e); }
        Bukkit.getPluginManager().registerEvents(this, this);
        Bukkit.getOnlinePlayers().forEach(this::tap);
    }
    @Override public void onDisable() { if (out != null) { drainNet(); out.flush(); out.close(); } }

    private long tick() { return Bukkit.getCurrentTick(); }
    private static String v(Vec3 x) { return String.format(Locale.ROOT, "[%.9f,%.9f,%.9f]", x.x, x.y, x.z); }
    private static String q(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
    private void emit(String type, String body) {
        drainNet();
        out.println("{\"seq\":" + seq.incrementAndGet() + ",\"tick\":" + tick() + ",\"ns\":" + System.nanoTime() + ",\"type\":" + q(type) + (body.isEmpty() ? "" : "," + body) + "}");
    }
    private void drainNet() { String s; while ((s = netQueue.poll()) != null) out.println(s); }

    private String state(String key, ServerPlayer p) {
        try {
            return q(key) + ":{\"name\":" + q(p.getScoreboardName())
                + ",\"pos\":" + v(p.position()) + ",\"dm\":" + v(p.getDeltaMovement())
                + ",\"known\":" + v(p.getKnownMovement())
                + ",\"onGround\":" + p.onGround() + ",\"fall\":" + p.fallDistance
                + ",\"sprint\":" + p.isSprinting() + ",\"shift\":" + p.isShiftKeyDown()
                + ",\"yRot\":" + p.getYRot() + ",\"xRot\":" + p.getXRot() + ",\"yHeadRot\":" + p.getYHeadRot()
                + ",\"slot\":" + p.getInventory().getSelectedSlot()
                + ",\"main\":" + q(String.valueOf(p.getMainHandItem().getItem()))
                + ",\"atkDmg\":" + p.getAttributeValue(Attributes.ATTACK_DAMAGE)
                + ",\"atkSpd\":" + p.getAttributeValue(Attributes.ATTACK_SPEED)
                + ",\"ast\":" + attackStrengthTicker.getInt(p)
                + ",\"scale0\":" + p.getAttackStrengthScale(0f) + ",\"scale05\":" + p.getAttackStrengthScale(0.5f)
                + ",\"using\":" + p.isUsingItem() + ",\"useRemain\":" + p.useItemRemaining + ",\"blocking\":" + p.isBlocking()
                + ",\"iframes\":" + p.invulnerableTime + ",\"lastHurt\":" + lastHurt.getFloat(p) + ",\"hurtTime\":" + p.hurtTime
                + ",\"health\":" + p.getHealth()
                + ",\"stuck\":" + v((Vec3) stuckSpeed.get(p)) + ",\"inWater\":" + p.isInWater()
                + ",\"shieldCd\":" + p.getCooldowns().isOnCooldown(p.getOffhandItem())
                + "}";
        } catch (Exception e) { return q(key) + ":{\"err\":" + q(e.toString()) + "}"; }
    }
    private ServerPlayer nms(org.bukkit.entity.Player p) { return ((CraftPlayer) p).getHandle(); }

    // ---------- per-tick snapshot ----------
    @EventHandler(priority = EventPriority.MONITOR)
    public void onTickEnd(ServerTickEndEvent e) {
        for (org.bukkit.entity.Player p : Bukkit.getOnlinePlayers()) emit("tickEnd", state("p", nms(p)));
    }

    // ---------- combat events (observe only) ----------
    @EventHandler(priority = EventPriority.MONITOR)
    public void onPreAttack(PrePlayerAttackEntityEvent e) {
        String t = (e.getAttacked() instanceof org.bukkit.entity.Player tp) ? "," + state("target", nms(tp)) : "";
        emit("preAttack", state("attacker", nms(e.getPlayer())) + t + ",\"willAttack\":" + e.willAttack());
    }
    @EventHandler(priority = EventPriority.MONITOR)
    public void onKb(EntityKnockbackEvent e) {
        Entity h = ((CraftEntity) e.getEntity()).getHandle();
        emit("knockback", "\"entity\":" + q(e.getEntity().getName()) + ",\"cause\":" + q(e.getCause().name())
            + ",\"kb\":" + String.format(Locale.ROOT, "[%.9f,%.9f,%.9f]", e.getKnockback().getX(), e.getKnockback().getY(), e.getKnockback().getZ())
            + ",\"dmBefore\":" + v(h.getDeltaMovement()) + ",\"onGround\":" + h.onGround()
            + ",\"cancelled\":" + e.isCancelled());
    }
    @EventHandler(priority = EventPriority.MONITOR)
    public void onDamage(EntityDamageEvent e) {
        StringBuilder mods = new StringBuilder("{");
        for (EntityDamageEvent.DamageModifier m : EntityDamageEvent.DamageModifier.values()) {
            if (e.isApplicable(m)) { if (mods.length() > 1) mods.append(','); mods.append(q(m.name())).append(':').append(e.getDamage(m)); }
        }
        mods.append('}');
        String by = (e instanceof EntityDamageByEntityEvent b) ? ",\"by\":" + q(b.getDamager().getName()) + ",\"critical\":" + b.isCritical() : "";
        emit("damage", "\"entity\":" + q(e.getEntity().getName()) + ",\"cause\":" + q(e.getCause().name()) + ",\"final\":" + e.getFinalDamage()
            + ",\"mods\":" + mods + by + ",\"cancelled\":" + e.isCancelled());
    }
    @EventHandler(priority = EventPriority.MONITOR)
    public void onVel(PlayerVelocityEvent e) {
        emit("velocitySent", "\"player\":" + q(e.getPlayer().getName()) + String.format(Locale.ROOT, ",\"vel\":[%.9f,%.9f,%.9f]", e.getVelocity().getX(), e.getVelocity().getY(), e.getVelocity().getZ()) + ",\"cancelled\":" + e.isCancelled());
    }
    @EventHandler(priority = EventPriority.MONITOR)
    public void onShieldDisable(PlayerShieldDisableEvent e) { emit("shieldDisable", "\"player\":" + q(e.getPlayer().getName()) + ",\"cooldown\":" + e.getCooldown() + ",\"cancelled\":" + e.isCancelled()); }
    @EventHandler(priority = EventPriority.MONITOR)
    public void onCdReset(PlayerAttackEntityCooldownResetEvent e) { emit("cooldownReset", "\"player\":" + q(e.getPlayer().getName()) + ",\"cooldownAtReset\":" + e.getCooledAttackStrength() + ",\"cancelled\":" + e.isCancelled()); }
    @EventHandler(priority = EventPriority.MONITOR)
    public void onHeld(PlayerItemHeldEvent e) { emit("held", state("p", nms(e.getPlayer())) + ",\"from\":" + e.getPreviousSlot() + ",\"to\":" + e.getNewSlot()); }
    @EventHandler(priority = EventPriority.MONITOR)
    public void onSprint(PlayerToggleSprintEvent e) { emit("sprintToggle", "\"player\":" + q(e.getPlayer().getName()) + ",\"to\":" + e.isSprinting()); }
    @EventHandler(priority = EventPriority.MONITOR)
    public void onJump(PlayerJumpEvent e) { emit("serverJump", state("p", nms(e.getPlayer()))); }
    @EventHandler(priority = EventPriority.MONITOR)
    public void onRiptide(org.bukkit.event.player.PlayerRiptideEvent e) {
        emit("riptide", state("p", nms(e.getPlayer())) + String.format(Locale.ROOT, ",\"push\":[%.6f,%.6f,%.6f]", e.getVelocity().getX(), e.getVelocity().getY(), e.getVelocity().getZ()));
        ServerPlayer sp = nms(e.getPlayer());
        Bukkit.getScheduler().runTask(this, () -> emit("riptideNextTask", state("p", sp)));
    }
    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent e) { tap(e.getPlayer()); }

    // ---------- read-only inbound packet tap ----------
    private void tap(org.bukkit.entity.Player p) {
        String name = p.getName();
        var ch = nms(p).connection.connection.channel;
        if (ch.pipeline().get("combatprobe_tap") != null) return;
        ch.pipeline().addBefore("packet_handler", "combatprobe_tap", new ChannelDuplexHandler() {
            @Override public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
                String cls = msg.getClass().getSimpleName();
                if (NET_OF_INTEREST.contains(cls)) {
                    String extra = "";
                    if (msg instanceof net.minecraft.network.protocol.game.ServerboundMovePlayerPacket m)
                        extra = String.format(Locale.ROOT, ",\"x\":%s,\"y\":%s,\"z\":%s,\"yRot\":%s,\"xRot\":%s,\"onGround\":%s", m.getX(Double.NaN), m.getY(Double.NaN), m.getZ(Double.NaN), m.getYRot(Float.NaN), m.getXRot(Float.NaN), m.isOnGround());
                    else if (msg instanceof net.minecraft.network.protocol.game.ServerboundSetCarriedItemPacket s) extra = ",\"slot\":" + s.getSlot();
                    else if (msg instanceof net.minecraft.network.protocol.game.ServerboundPlayerCommandPacket c) extra = ",\"action\":" + q(c.getAction().name());
                    netQueue.add("{\"type\":\"netIn\",\"ns\":" + System.nanoTime() + ",\"tickAtArrival\":" + Bukkit.getCurrentTick() + ",\"player\":" + q(name) + ",\"pkt\":" + q(cls) + extra + "}");
                }
                super.channelRead(ctx, msg);
            }
        });
    }

    @Override public boolean onCommand(CommandSender s, Command c, String l, String[] a) {
        if (a.length >= 2 && a[0].equals("mark")) { emit("mark", "\"label\":" + q(String.join(" ", Arrays.copyOfRange(a, 1, a.length)))); s.sendMessage("marked"); }
        if (a.length >= 1 && a[0].equals("flush")) { drainNet(); out.flush(); s.sendMessage("flushed"); }
        return true;
    }
}
